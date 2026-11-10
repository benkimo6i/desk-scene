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
from mathutils.kdtree import KDTree

CELL = 0.0035                       # sculpting resolution

# Body rebuilt 2026-11-08 from the user's reference, the "Low Poly Cartoon Hungarian Vizsla Dog"
# on Sketchfab (chroma3d): measured from its side, front, back and top views (narrow-lens shots
# of the online viewer, one scale for all), and scaled so nose to rump matches the old dog
# (0.93 here, 0.65 m at DOG_SCALE 0.7). Only the shape is taken: the surface stays smooth for the
# toon shading. The head is the earlier one, moved onto the reference's taller neck.

# The head is placed by a frame: its middle, the way the muzzle points, and the way the top of
# the skull faces. Points on the head are given along that frame.
HEAD_AT = Vector((0.33, 0, 0.732))
HEAD_DIR = Vector((0.995, 0, -0.1)).normalized()
HEAD_TOP = Vector((0.1, 0, 0.995)).normalized()


def along_head(forward, top=0.0, side=0.0):
    return HEAD_AT + HEAD_DIR * forward + HEAD_TOP * top + Vector((0, side, 0))


def head_point(forward, top, radius):
    return (*along_head(forward, top), radius)


def ear_point(forward, top, side, half):
    return (*along_head(forward, top, side), half)


EAR_FLAT = 3.5
EAR_WIDTH = 0.062                   # widest, across the flap
LEG_FLAT = 1.25                     # legs are narrower seen from the front than from the side
FRONT_SIDE, HIND_SIDE = 0.083, 0.083   # how far each pair of legs stands from the middle
PAW_Z = 0.018                       # paw centres sit this high, so the soles rest on the ground


def front_leg(side):
    """Shoulder inside the chest, then a long, nearly straight column from the elbow to the foot."""
    y = side * FRONT_SIDE
    return [(0.15, y * 0.45, 0.45, 0.05), (0.165, y, 0.33, 0.045), (0.157, y, 0.19, 0.031),
            (0.158, y, 0.075, 0.028), (0.17, y, PAW_Z, 0.025)]


def hind_leg(side):
    """Hip inside the rump, thigh down to the stifle, a long shin back to a hock that sits behind
    the rump, then an upright rear pastern to the foot."""
    y = side * HIND_SIDE
    return [(-0.33, y * 0.6, 0.45, 0.08), (-0.372, y, 0.3, 0.042), (-0.495, y, 0.19, 0.032),
            (-0.516, y, 0.07, 0.027), (-0.52, y, PAW_Z, 0.025)]


def thigh(side):
    """The thigh: broad from front to back and thin from side to side, down to the stifle."""
    y = side * HIND_SIDE
    return [(-0.33, y * 0.9, 0.44, 0.09), (-0.33, y, 0.39, 0.092), (-0.35, y, 0.34, 0.068),
            (-0.375, y, 0.3, 0.04)]


def ear(side):
    """The ear's line, root to tip: from the top-back of the skull, hanging down over the cheek
    to about the jaw line (the flap itself is built around it in ear_flap)."""
    s = side
    return [ear_point(-0.035, 0.05, s * 0.04, 0.012), ear_point(-0.04, 0.02, s * 0.06, 0.02),
            ear_point(-0.042, -0.012, s * 0.066, 0.024), ear_point(-0.04, -0.044, s * 0.064, 0.023),
            ear_point(-0.034, -0.072, s * 0.056, 0.016)]


def ear_half_width(t):
    """A rounded leaf: a narrow, rounded root, widest a little below the middle, a round tip."""
    import math
    return EAR_WIDTH / 2 * math.sin(math.pi * (0.1 + 0.9 * t)) ** 0.45 * (0.75 + 0.25 * t)


TAIL_LENGTH = 1.182                 # stretched from the root to the old dog's tail length, 0.31 (2026-11-08)


def tail():
    """Thin, hanging from the top-back of the rump, tapering to a point."""
    drawn = [(-0.385, 0.52, 0.02), (-0.41, 0.47, 0.016), (-0.42, 0.42, 0.014),
             (-0.425, 0.36, 0.013), (-0.425, 0.31, 0.011), (-0.42, 0.265, 0.007)]
    bx, bz = drawn[0][:2]
    return [(bx + (x - bx) * TAIL_LENGTH, 0, bz + (z - bz) * TAIL_LENGTH, r) for x, z, r in drawn]


# Each chain is (name, parent bone, points, blend radius, flatten). A point is x, y, z, radius.
# Flatten squeezes the limb across the dog (in Y); below 1 it widens it.
CHAINS = [
    # Rump to chest: a level topline, a deep chest down to the elbows, and a belly line rising
    # steadily to the flank.
    ("Spine", None, [(-0.33, 0, 0.445, 0.092), (-0.234, 0, 0.49, 0.091), (-0.134, 0, 0.486, 0.096),
                     (0.0, 0, 0.463, 0.116), (0.1, 0, 0.465, 0.137), (0.17, 0, 0.49, 0.11)], 0, 1.2),
    # The loin is as wide as the chest seen from above: a wide, shallow shape inside the body.
    ("Loin", "Spine1", [(-0.3, 0, 0.5, 0.075), (-0.05, 0, 0.49, 0.075)], 0.04, 0.72),
    # The neck rises steeply from inside the chest into the back of the skull.
    ("Neck", "Spine4", [(0.16, 0, 0.5, 0.095), (0.218, 0, 0.596, 0.082), (0.262, 0, 0.65, 0.074),
                        (0.3, 0, 0.7, 0.065)], 0.04, 1.15),
    # A long, round skull (user's cut, 2026-11-08): the back is smaller and lower than before and
    # blends wide into the neck, so the top runs in one arc from the brow down the back of the neck.
    ("Head", "Neck2", [head_point(-0.02, -0.008, 0.061), head_point(0.03, 0.0, 0.057)], 0.03, 1.14),
    # The muzzle starts wide inside the skull, so the forehead runs into it with only a slight dip.
    ("Muzzle", "Head0", [head_point(0.02, -0.01, 0.052), head_point(0.06, -0.02, 0.04), head_point(0.11, -0.028, 0.03),
                         head_point(0.158, -0.032, 0.027)], 0.016, 1.08),
    # A soft blend, so the end of the jaw runs into the muzzle without a lump under the chin.
    ("Jaw", "Head0", [head_point(-0.005, -0.05, 0.03), head_point(0.03, -0.052, 0.024), head_point(0.125, -0.046, 0.016)], 0.014, 1.1),
    # Ears are flat limbs with a tight blend, so they sit on the head with a clean edge. Each
    # starts buried in the skull, which joins it softly at the root, and hangs over the cheek.
    ("EarL", "Head0", ear(1), 0.004, EAR_FLAT),
    ("EarR", "Head0", ear(-1), 0.004, EAR_FLAT),
    ("FrontL", "Spine4", front_leg(1), 0.024, LEG_FLAT),
    ("FrontR", "Spine4", front_leg(-1), 0.024, LEG_FLAT),
    ("HindL", "Spine0", hind_leg(1), 0.014, LEG_FLAT),
    ("HindR", "Spine0", hind_leg(-1), 0.014, LEG_FLAT),
    ("ThighL", "HindL0", thigh(1), 0.03, 2.2),
    ("ThighR", "HindR0", thigh(-1), 0.03, 2.2),
    ("Tail", "Spine0", tail(), 0.02, 1.0),
]
LEGS = ("FrontL", "FrontR", "HindL", "HindR")
# Shape only: these add volume but get no bones of their own; they move with their parent bone.
SHAPE_ONLY = ("Loin", "ThighL", "ThighR")

NOSE = (along_head(0.184, -0.024), (0.017, 0.016, 0.013))
# A closed eye on each side: one soft line bowing toward the jaw, as centre, length, bow and width.
EYE = (along_head(0.056, 0.004, 0.05), 0.028, 0.004, 0.008)
# Paws: a simple rounded foot, domed on top and flat on the sole, reaching forward from the leg
# with no heel (user, 2026-11-08); about 10 cm long and 7 cm wide, as on the reference.
PAW_BACK, PAW_FRONT = 0.0, 0.054     # how far the paw reaches behind and ahead of its centre
HEEL_CUT = 0.017                    # the paw stops this far behind its centre
PAW_WIDE = 0.034
PAW_DOME = 1.25                     # flattens the dome; the sole cuts it well above its bottom, so it is a real flat oval
PAW_NARROW = 1.0                    # across the paw, leaving its length alone
PAW_SOLE = 0.018                    # how far the sole sits from the paw's centre line
# Flat pad marks on the sole, as across and toward-the-toes offsets from the paw's centre, with half sizes.
# Kept inside the flat sole: toe pads further out overhung the rounded toe and one tore into a spike.
PADS = [((0, 0.008), (0.015, 0.012)), ((-0.016, 0.03), (0.0062, 0.0078)), ((-0.0055, 0.039), (0.0062, 0.0078)),
        ((0.0055, 0.039), (0.0062, 0.0078)), ((0.016, 0.03), (0.0062, 0.0078))]
PAD_THICKNESS = 0.0015              # flat marks on the sole, not raised pads (illustrated style)


def paw_frame(points):
    """Returns a leg's paw centre, toward-the-toes, across, and sole directions. Standing, the
    toes point forward and the sole faces the ground."""
    paw = Vector(points[-1][:3])
    toes, sole = Vector((1, 0, 0)), Vector((0, 0, -1))
    return paw, toes, sole.cross(toes).normalized(), sole


def skin_distance(q, chains):
    """The sculpted surface's distance at points q (n x 3), built from the named chains the way
    sculpt() builds a part: negative inside."""
    limbs = chain_distances(q, chains)
    field = np.full(len(q), 1.0)
    first = True
    for name, _, _, blend, _ in CHAINS:
        if name not in chains:
            continue
        limb = np.minimum(limbs[name], 1.0)
        field = np.minimum(field, limb) if (first or not blend) else smooth_min(field, limb, blend)
        first = False
    return field


def smooth_min(a, b, blend):
    h = np.clip(0.5 + 0.5 * (a - b) / blend, 0, 1)
    return a + (b - a) * h - blend * h * (1 - h)


def capsule(x, y, z, a, r0, b, r1, flatten):
    ab = b - a
    t = np.clip(((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / (ab @ ab), 0, 1)
    dy = (y - a[1] - t * ab[1]) * flatten
    return np.sqrt((x - a[0] - t * ab[0]) ** 2 + dy ** 2 + (z - a[2] - t * ab[2]) ** 2) - (r0 + (r1 - r0) * t)


# The dog is built from separate, overlapping parts, each its own mesh on the one skeleton
# (2026-11-08): the body with the head, each leg with its thigh or shoulder and its paw, and the
# tail. Each leg's top sits inside the body around the joint it turns on. Being separate meshes,
# the ink pass outlines a leg wherever it lies over the body or another leg, from real edges
# rather than from labels painted on one fused skin. The ears are thin flaps (ear_flap).
PARTS = {
    "Body": ("Spine", "Loin", "Neck", "Head", "Muzzle", "Jaw"),
    "FrontL": ("FrontL",), "FrontR": ("FrontR",),
    "HindL": ("HindL", "ThighL"), "HindR": ("HindR", "ThighR"),
    "Tail": ("Tail",),
}
# Quads for each part after the remesh: about even in size across the dog.
PART_FACES = {"Body": 5200, "FrontL": 800, "FrontR": 800, "HindL": 1000, "HindR": 1000, "Tail": 800}
JOINT_BLEND = 0.008                 # how softly a limb's own segments run into each other


def sculpt(part):
    """Draws one part as a distance field, then meshes its surface."""
    chains = [c for c in CHAINS if c[0] in PARTS[part]]
    points = np.array([p[:3] for chain in chains for p in chain[2]])
    low = points.min(axis=0) - 0.16
    high = points.max(axis=0) + 0.16
    size = np.ceil((high - low) / CELL).astype(int)
    field = np.full(size, 1.0, dtype=np.float32)

    def grid_around(ends, margins):
        lo = np.maximum(((ends - margins - low) / CELL).astype(int), 0).min(axis=0)
        hi = np.minimum(((ends + margins - low) / CELL).astype(int) + 2, size).max(axis=0)
        window = tuple(slice(lo[i], hi[i]) for i in range(3))
        return window, np.meshgrid(*[low[i] + CELL * np.arange(lo[i], hi[i], dtype=np.float32) for i in range(3)], indexing="ij")

    for k, (_, _, chain, blend, flatten) in enumerate(chains):
        ends = np.array(chain)
        window, (x, y, z) = grid_around(ends[:, :3], ends[:, 3:4] * 1.1 + blend + 0.03)
        limb = np.full(x.shape, 1.0, dtype=np.float32)
        for p0, p1 in zip(chain, chain[1:]):
            seg = capsule(x, y, z, np.array(p0[:3]), p0[3], np.array(p1[:3]), p1[3], flatten)
            limb = smooth_min(limb, seg, JOINT_BLEND) if part != "Body" else np.minimum(limb, seg)
        # The first chain of a part starts it; the rest join it with their own blend.
        field[window] = smooth_min(field[window], limb, blend) if (k and blend) else np.minimum(field[window], limb)

    for chain, _, chain_points, *_ in chains:
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
    return surface_mesh(f"Dog{part}", field, low, PART_FACES[part])


def surface_mesh(name, f, origin, faces_wanted):
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
    return quad_remesh(name, me, faces_wanted)


def quad_remesh(name, dense, faces_wanted):
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
    # Kept to pull the remesh back onto it: thinning crumples thin parts such as the level tail.
    target = BVHTree.FromPolygons([v.co.copy() for v in dense.vertices], [tuple(p.vertices) for p in dense.polygons])
    with bpy.context.temp_override(**override):
        bpy.ops.object.voxel_remesh()
        bpy.ops.object.modifier_apply(modifier=thin.name)
        result = bpy.ops.object.quadriflow_remesh(target_faces=faces_wanted, use_mesh_symmetry=False, use_preserve_sharp=False,
                                                  use_preserve_boundary=False, smooth_normals=False, seed=0)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Dog quad remesh failed: {result}")
    me = ob.data
    settle_onto(me, target)
    bpy.data.objects.remove(ob, do_unlink=True)
    if dense.users == 0 and dense != me:
        bpy.data.meshes.remove(dense)
    me.name = name
    return me


def settle_onto(me, target, rounds=6):
    """Evens out the remesh and puts each vertex back on the sculpted surface, so crumples the
    thinning left (2026-11-08, the tail) are smoothed away without changing the shape."""
    bm = bmesh.new()
    bm.from_mesh(me)
    # Each vertex goes back along its own normal, not to the nearest surface: smoothing pulls a
    # thin tube like the tail toward its centre, from where the nearest surface can be the far
    # side or a thigh, and the tail collapsed into a strand (2026-11-08).
    def back_onto(v):
        best = None
        for direction in (v.normal, -v.normal):
            hit, _, _, dist = target.ray_cast(v.co, direction, 0.02)
            if hit is not None and (best is None or dist < best[1]):
                best = (hit, dist)
        if best is None:
            best = target.find_nearest(v.co)[:1] + (0,)
        if best[0] is not None:
            v.co = best[0]

    for _ in range(rounds):
        bm.normal_update()
        normals = {v: v.normal.copy() for v in bm.verts}
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        for v in bm.verts:
            v.normal = normals[v]
            back_onto(v)
    # Folded faces (they face into the body) show as dark specks: relax their corners harder.
    for _ in range(8):
        bm.normal_update()
        folded = set()
        for f in bm.faces:
            normal = target.find_nearest(f.calc_center_median())[1]
            if normal is not None and f.normal.dot(normal) < -0.3:   # truly flipped; looser flagged the thin ear rims and flattened them
                folded.update(f.verts)
        if not folded:
            break
        around = set(folded)
        for v in folded:
            around.update(e.other_vert(v) for e in v.link_edges)
        for _ in range(3):
            bmesh.ops.smooth_vert(bm, verts=list(around), factor=1.0, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        for v in around:
            hit = target.find_nearest(v.co)[0]
            if hit is not None:
                v.co = hit
    bm.to_mesh(me)
    bm.free()


def add_shell(bm, centre, axes, radii):
    """Adds a small flattened ball, for the nose and pads. Being separate geometry keeps their
    edges crisp however coarse the body is."""
    across, along, out = [Vector(a).normalized() for a in axes]
    frame = Matrix.Translation(centre) @ Matrix((across * radii[0], along * radii[1], out * radii[2])).transposed().to_4x4()
    return bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1, matrix=frame)["verts"]


def add_parts(me, part):
    """Adds the nose and eyes (to the body) or the pads (to a leg). Returns each vertex's detail
    number, and for each detail its owning bone and mark; the part's own skin is 0. Vertices are
    tagged rather than counted, since Blender reuses freed slots while it builds a ball, so they
    aren't in order."""
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

    if part == "Body":
        centre, radii = NOSE
        add_part(add_shell(bm, centre, (Vector((0, 1, 0)), HEAD_TOP, HEAD_DIR), radii), "Muzzle2", (0, 1))

    for chain, _, points, *_ in CHAINS:
        if chain != part or chain not in LEGS:
            continue
        paw, toes, across, sole = paw_frame(points)
        for (a, b), radii in PADS:
            point = paw + across * a + toes * b
            pad = add_shell(bm, on_surface(point, sole), (across, toes, sole), (*radii, PAD_THICKNESS))
            add_part(pad, f"{chain}{len(points) - 1}", (0, 1))   # the toe bone

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # Each eye is a thin strip laid on the skull, added last so it keeps facing outward.
    centre, length, bow, width = EYE
    for side in ((1, -1) if part == "Body" else ()):
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


# The ears: thin flaps laid over the skull and cheek, rooted inside the skull at the top. Their
# outline comes from the flap's own edge, so it is one clean curve (user's "ear fix" reference,
# 2026-11-08). The flap follows its ear chain, so its bones bend it like the old ear.
EAR_ROWS, EAR_COLUMNS = 22, 11
EAR_THICK = 0.0035
# The root grows out of the skull (user, 2026-11-08: no step where the ear meets the head): the
# flap starts just under the skin with no thickness and rises gently out of it, thickening as it
# goes, so there is no edge at its top to see.
EAR_GAP = (-0.004, 0.0035)          # the flap's outer face over the skin: at the root, and lying on the cheek
EAR_GAP_FROM, EAR_GAP_AT = 0.08, 0.34  # down the flap: where it starts to rise, and where it is fully out
EAR_THICK_AT = 0.35                 # down the flap: where it reaches its full thickness


# The folded ear (user, 2026-11-08, for the donut): the same flap laid back from its root along
# the back of the skull and down the neck, kept as a shape key named "Folded" (same vertices),
# since a flap fitted to the cheek can't be swung back by its bones without standing on edge.
EAR_FOLD_DIR = (-0.75, 0.15, -0.55) # back, out and down, in head terms (along, side, top)
EAR_FOLD_FORWARD = 0.035            # the folded ear's root moves this far forward, to just behind the eye (user, 2026-11-08)


def ear_flap(side, folded=False):
    """Builds one ear as its own closed, thin mesh in dog space. Returns the mesh and each
    vertex's place down the flap (0 at the root, 1 at the tip). Folded lays it back along the
    neck instead (EAR_FOLD_DIR), with the vertices in the same order."""
    import math
    chain = f"Ear{'L' if side > 0 else 'R'}"
    line = [Vector(p[:3]) for p in next(c[2] for c in CHAINS if c[0] == chain)]
    lengths = [(b - a).length for a, b in zip(line, line[1:])]
    total = sum(lengths)
    if folded:
        a, sd, tp = EAR_FOLD_DIR
        back = (HEAD_DIR * a + Vector((0, side * sd, 0)) + HEAD_TOP * tp).normalized()
        root = line[0] + HEAD_DIR * EAR_FOLD_FORWARD
        line = [root + back * total * k / 4 for k in range(5)]
        lengths = [total / 4] * 4

    def along(t):
        d = t * total
        for a, b, seg in zip(line, line[1:], lengths):
            if d <= seg or b is line[-1]:
                return a + (b - a) * min(d / seg, 1.0), (b - a).normalized()
            d -= seg

    # The flap is laid on the sculpted skull itself (its distance field), not on the remeshed
    # skin: the remesh has small bumps, and a flap that copied them got a wavy edge (2026-11-08).
    def skull(q):
        return skin_distance(q, PARTS["Body"])

    def skull_normal(q):
        e = 1e-4
        g = np.array([skull(q + np.array(d) * e) - skull(q - np.array(d) * e) for d in np.eye(3)]).T
        return g / (np.linalg.norm(g, axis=-1, keepdims=True) + 1e-12)

    def onto_skull(q, out):
        q = q + out * 0.05
        for _ in range(40):
            q = q - out * skull(q)[:, None]
        return q

    grid = np.zeros((EAR_ROWS + 1, EAR_COLUMNS + 1, 3))
    gaps = []
    for i in range(EAR_ROWS + 1):
        t = i / EAR_ROWS
        centre, tangent = along(t)
        out = Vector(skull_normal(np.array([centre[:]]))[0])
        across = tangent.cross(out).normalized()
        rise = min(max((t - EAR_GAP_FROM) / (EAR_GAP_AT - EAR_GAP_FROM), 0.0), 1.0)
        gaps.append(EAR_GAP[0] + (EAR_GAP[1] - EAR_GAP[0]) * rise * rise * (3 - 2 * rise))
        row = np.array([centre + across * (j / EAR_COLUMNS * 2 - 1) * max(ear_half_width(t), 0.0008)
                        for j in range(EAR_COLUMNS + 1)])
        grid[i] = onto_skull(row, np.array(out))
    for _ in range(12):
        inner = grid.copy()
        inner[1:-1, 1:-1] = (grid[:-2, 1:-1] + grid[2:, 1:-1] + grid[1:-1, :-2] + grid[1:-1, 2:]) / 4
        inner[1:-1, 0] = (grid[:-2, 0] + grid[2:, 0]) / 2       # the long edges smooth along themselves
        inner[1:-1, -1] = (grid[:-2, -1] + grid[2:, -1]) / 2
        grid = grid * 0.5 + inner * 0.5
    # The grid's own normals, pointing away from the head.
    du = np.gradient(grid, axis=0)
    dv = np.gradient(grid, axis=1)
    normals = np.cross(du, dv)
    normals /= np.linalg.norm(normals, axis=2, keepdims=True) + 1e-12
    if normals[EAR_ROWS // 2, EAR_COLUMNS // 2, 1] * side < 0:
        normals = -normals
    bm = bmesh.new()
    front, back = [], []
    for i in range(EAR_ROWS + 1):
        front.append([bm.verts.new(grid[i, j] + normals[i, j] * gaps[i]) for j in range(EAR_COLUMNS + 1)])
        thick = EAR_THICK * max(min(i / EAR_ROWS / EAR_THICK_AT, 1.0), 0.02) ** 0.6
        back.append([bm.verts.new(grid[i, j] + normals[i, j] * (gaps[i] - thick)) for j in range(EAR_COLUMNS + 1)])
    for i in range(EAR_ROWS):
        for j in range(EAR_COLUMNS):
            bm.faces.new((front[i][j], front[i][j + 1], front[i + 1][j + 1], front[i + 1][j]))
            bm.faces.new((back[i][j], back[i + 1][j], back[i + 1][j + 1], back[i][j + 1]))
    # Close the rim all round: both long edges, the root and the tip.
    rim = [(i, 0) for i in range(EAR_ROWS + 1)] + [(EAR_ROWS, j) for j in range(1, EAR_COLUMNS + 1)] + \
          [(i, EAR_COLUMNS) for i in range(EAR_ROWS - 1, -1, -1)] + [(0, j) for j in range(EAR_COLUMNS - 1, -1, -1)]
    for (i0, j0), (i1, j1) in zip(rim, rim[1:] + rim[:1]):
        try:
            bm.faces.new((front[i0][j0], back[i0][j0], back[i1][j1], front[i1][j1]))
        except ValueError:
            pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(f"Dog{chain}")
    bm.to_mesh(me)
    bm.free()
    # Each vertex's place down the flap, for the open root (no ink line there) and the skin.
    root, tip = line[0], line[-1]
    co = np.array([v.co[:] for v in me.vertices])
    axis = np.array(tip - root)
    t = np.clip((co - np.array(root)) @ axis / (axis @ axis), 0, 1)
    return me, t


def build_meshes():
    """Every part's mesh in dog space: {part: (mesh, detail of each vertex, details, place down
    the flap for the ears)}. The ears
    come last, since they are laid over the finished body."""
    meshes = {}
    for part in PARTS:
        me = sculpt(part)
        part_of, details = add_parts(me, part)
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        meshes[part] = (me, part_of, details, None)
    for side, chain in ((1, "EarL"), (-1, "EarR")):
        me, t = ear_flap(side)
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        fold, _ = ear_flap(side, folded=True)
        if len(fold.vertices) != len(me.vertices):
            raise RuntimeError("folded ear has different vertices")
        co = np.zeros(len(fold.vertices) * 3)
        fold.vertices.foreach_get("co", co)
        bpy.data.meshes.remove(fold)
        me["folded"] = co.tolist()      # becomes the "Folded" shape key in build()
        meshes[chain] = (me, np.zeros(len(me.vertices), dtype=np.int32), [None], t)
    return meshes


# ----------------------------------------------------------------- rig
ROOT_BONE = "Root"


def chain_bones(chain):
    """Bone names of a chain: one per segment, numbered from its root. A leg has one more, its
    toes (see build_skeleton)."""
    points = next(c[2] for c in CHAINS if c[0] == chain)
    return [f"{chain}{k}" for k in range(len(points) - (0 if chain in LEGS else 1))]


TOE_RADIUS = 0.03                   # how thick the toes are, for the skin weights
TWIST = "NeckTwist"                 # the neck's twist bones: NeckTwist0, 1, 2
# How sharply the body's skin hands over from one bone to the next (higher is sharper). Softer
# than the legs', so a head rolled on its neck (the donut's chin on the bed) twists the whole
# throat a little rather than pinching it at the jaw (2026-11-08).
BODY_FALLOFF = 3.5
TAIL_FALLOFF = 2.5                   # the tail bends in a smooth curve, not at five corners (donut, 2026-11-08)


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
            # Neck twist bones (2026-11-08): one along each neck bone, carrying the neck's skin. Turned
            # about their own length they wring the neck gradually, so a head rolled on its neck
            # (the donut's chin on the bed) shares the twist down the throat instead of pinching
            # the skin under the jaw. At rest they change nothing.
            if chain == "Neck":
                for k, (p0, p1) in enumerate(zip(points, points[1:])):
                    twist = arm.edit_bones.new(f"{TWIST}{k}")
                    twist.head, twist.tail = p0[:3], p1[:3]
                    twist.align_roll(Vector((0, 1, 0)))
                    twist.parent = arm.edit_bones[f"Neck{k}"]
                    twist.use_connect = False
                    arm.edit_bones[f"Neck{k}"].use_deform = False
            # The toes: a hinge at the paw's centre, reaching to the toe tips, so a paw can point
            # in line with its leg or curl without swinging the whole foot about the ankle (2026-11-08).
            if chain in LEGS:
                paw, toes, *_ = paw_frame(points)
                bone = arm.edit_bones.new(f"{chain}{len(points) - 1}")
                bone.head, bone.tail = paw, paw + toes * PAW_FRONT
                bone.align_roll(Vector((0, 1, 0)))
                bone.parent = arm.edit_bones[previous]
                bone.use_connect = False
                segments.append((bone.name, np.array(paw[:]), np.array((paw + toes * PAW_FRONT)[:]), TOE_RADIUS))
        bpy.ops.object.mode_set(mode="OBJECT")
    return rig, segments


def world_verts(ob):
    """The evaluated (posed) mesh's vertices in world space, n x 3."""
    e = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = e.to_mesh()
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    m = np.array(e.matrix_world)
    e.to_mesh_clear()
    return co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]


def chain_distances(co, only=None):
    """Each point's distance to the surface of every chain (negative inside), by chain name; only
    limits it to the named chains."""
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    out = {}
    for chain, _, points, _, flatten in CHAINS:
        if only is not None and chain not in only:
            continue
        d = np.full(len(co), np.inf)
        for p0, p1 in zip(points, points[1:]):
            d = np.minimum(d, capsule(x, y, z, np.array(p0[:3]), p0[3], np.array(p1[:3]), p1[3], flatten))
        out[chain] = d
    return out


def skin(dog, segments, part_of, parts, part):
    """Weights fall off with distance to each bone, scaled by how thick that part is. A part is
    moved only by its own chains' bones and the bones of the chain it hangs from (a leg's top
    sits inside the body, so the body's bones carry it at the joint). Inside the body, each
    vertex belongs to the chain it sits in, and only that chain, its parent and its children may
    move it. The small details (nose, eyes, pads) belong only to their own bones. Returns each
    vertex's main bone."""
    me = dog.data
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    names = [s[0] for s in segments]
    index = {n: i for i, n in enumerate(names)}
    own = PARTS.get(part, (part,))

    dist = chain_distances(co)
    chains = [c for c in own if c in dist]
    owner = np.array([body_chain(chains[i]) for i in np.argmin(np.stack([dist[c] for c in chains]), axis=0)])
    parent = {c[0]: (chain_of(c[1]) if c[1] else None) for c in CHAINS}

    def allowed(chain):
        bones = set(chain_bones(chain))
        if parent[chain]:
            bones |= set(chain_bones(body_chain(parent[chain])))
        for child, up in parent.items():
            if up == chain and child in own and child not in SHAPE_ONLY:
                bones |= set(chain_bones(child))
        return [index[b] for b in bones]

    weight = np.zeros((len(co), len(segments)))
    for i, (_, a, b, r) in enumerate(segments):
        ab = b - a
        t = np.clip(((co - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
        d = np.linalg.norm(co - (a + t[:, None] * ab), axis=1) / r
        weight[:, i] = 1 / np.maximum(d, 0.05) ** {"Body": BODY_FALLOFF, "Tail": TAIL_FALLOFF}.get(part, 6)
    mask = np.zeros_like(weight, dtype=bool)
    cache = {}
    for v in range(len(co)):
        if part_of[v]:
            mask[v, index[parts[part_of[v]][0]]] = True
            continue
        if owner[v] not in cache:
            cache[owner[v]] = allowed(owner[v])
        mask[v, cache[owner[v]]] = True
    weight = np.where(mask, weight, 0)
    # Below the elbow or stifle a leg moves only with its own bones. The paw reaches far ahead of
    # its last bone, so the thick body's distant falloff still won a quarter of its weight and
    # dragged the toes into spikes once the legs bent (2026-11-08).
    # The tail likewise moves only with its own bones (its root sits inside the rump). The thick
    # spine won part of the thin tail's skin, which then followed the hips and bunched up or kinked
    # once the tail was laid round the donut (2026-11-08).
    if part in LEGS or part == "Tail":
        mine = [index[b] for b in chain_bones(part)]
        nearest = np.array(mine)[np.argmax(weight[:, mine], axis=1)]
        low = np.nonzero(np.isin(nearest, mine if part == "Tail" else mine[2:]))[0]
        others = np.setdiff1d(np.arange(len(segments)), mine)
        weight[np.ix_(low, others)] = 0

    # The small details move exactly like the skin under them, so the pads stay on the sole when
    # the toes hinge (rigid to one bone, they lifted off the paw; per vertex, they crumpled, 2026-11-08).
    skin_rows = np.nonzero(part_of == 0)[0]
    if len(skin_rows) < len(co):
        under = KDTree(len(skin_rows))
        for i, c in enumerate(co[skin_rows]):
            under.insert(Vector(c), i)
        under.balance()
        # One set of weights per detail (from the skin under its middle), so each stays whole.
        for detail in set(part_of[part_of != 0].tolist()):
            rows = np.nonzero(part_of == detail)[0]
            nearest = under.find(Vector(co[rows].mean(axis=0)))[1]
            weight[rows] = weight[skin_rows[nearest]]

    # The neck's skin goes to its twist bones, which ride on the neck bones (build_skeleton).
    groups = [dog.vertex_groups.new(name=f"{TWIST}{n[4:]}" if n.startswith("Neck") else n) for n in names]
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
    """Builds the rigged dog into a collection: the armature (DogRig) with one mesh per part
    parented to it, named name + part (DogBody, DogFrontL, ... DogEarR). Returns the rig and
    {part: (object, detail of each vertex, details, each vertex's main bone, ear place or None)}."""
    rig, segments = build_skeleton(collection, name + "Rig")
    out = {}
    for part, (me, part_of, details, ear_t) in build_meshes().items():
        ob = bpy.data.objects.new(name + part, me)
        collection.objects.link(ob)
        ob.parent = rig
        main_bone = skin(ob, segments, part_of, details, part)
        if "folded" in me:
            ob.shape_key_add(name="Basis")
            ob.shape_key_add(name="Folded").data.foreach_set("co", me["folded"])
            del me["folded"]
        out[part] = (ob, part_of, details, main_bone, ear_t)
    return rig, out


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
