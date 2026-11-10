"""Rebuilds the scene, saves the .blend and writes the web GLBs. Run inside Blender.

The scene ships in stages so the site can draw the room first and add the rest as it
arrives: room.glb (walls, window, the hidden sun shell and the camera), desk.glb (the big
pieces you can click) and details.glb (small items and the dog)."""
import bpy, logging, os
from mathutils import Vector

BASE = "/Users/benkim/Development/desk-scene"
p = f"{BASE}/blender/build_desk.py"
exec(compile(open(p).read(), p, "exec"), {"__name__": "__main__"})
bpy.ops.wm.save_as_mainfile(filepath=f"{BASE}/blender/desk_scene.blend")

DESK = {"Desk", "Chair", "Laptop", "Monitor", "Phone", "Lamp", "Keyboard", "Mouse", "Mug"}
ROOM_PREFIXES = ("BackWall", "Floor", "Win", "Shell_")


def stage_of(name):
    if name == "Cam_Hero" or name.startswith(ROOM_PREFIXES):
        return "room"
    return "desk" if name in DESK else "details"


def to_three(v):
    return (v.x, v.z, -v.y)  # Blender (x, y, z) -> three (x, z, -y)


def three_box(obj):
    """World bounds as three's Box3.setFromObject measures them: each exported primitive
    (one per material) gets its own local box, and the box's 8 corners go to world."""
    lo, hi = [float("inf")] * 3, [float("-inf")] * 3
    for o in [obj, *obj.children_recursive]:
        if o.type != "MESH":
            continue
        mesh = o.data
        by_material = {}
        for poly in mesh.polygons:
            by_material.setdefault(poly.material_index, set()).update(poly.vertices)
        for verts in by_material.values():
            pts = [mesh.vertices[i].co for i in verts]
            mn = [min(c[k] for c in pts) for k in range(3)]
            mx = [max(c[k] for c in pts) for k in range(3)]
            for x in (mn[0], mx[0]):
                for y in (mn[1], mx[1]):
                    for z in (mn[2], mx[2]):
                        w = to_three(o.matrix_world @ Vector((x, y, z)))
                        lo = [min(a, b) for a, b in zip(lo, w)]
                        hi = [max(a, b) for a, b in zip(hi, w)]
    return [*lo, *hi]


# The camera frames itself around these before the desk has loaded (see frameDesk in main.js).
cam = bpy.data.objects["Cam_Hero"]
cam["fitBoxes"] = [v for name in ("Laptop", "Monitor_Panel", "Phone", "Mug") for v in three_box(bpy.data.objects[name])]

roots = [o for o in bpy.context.scene.objects if o.parent is None]
logging.disable(logging.INFO)
try:
    for stage in ("room", "desk", "details"):
        bpy.ops.object.select_all(action="DESELECT")
        for o in roots:
            if stage_of(o.name) == stage:
                for part in (o, *o.children_recursive):
                    part.hide_select = False
                    part.select_set(True)
        out = f"{BASE}/web/public/models/{stage}.glb"
        bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_visible=False, use_selection=True,
                                  export_cameras=stage == "room", export_lights=False, export_yup=True,
                                  export_apply=False, export_vertex_color="ACTIVE", export_extras=True,
                                  export_attributes=True)   # extras: camera framing, dog_part; attributes: the dog's _root joint marks
        print("GLB_KB", stage, os.path.getsize(out) // 1024)
finally:
    logging.disable(logging.NOTSET)
