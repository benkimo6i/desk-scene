"""Rebuilds the scene, saves the .blend and writes the web GLB. Run inside Blender."""
import bpy, logging, os
BASE = "/Users/benkim/Development/desk-scene"
p = f"{BASE}/blender/build_desk.py"
exec(compile(open(p).read(), p, "exec"), {"__name__": "__main__"})
bpy.ops.wm.save_mainfile()
out = f"{BASE}/web/public/models/desk.glb"
logging.disable(logging.INFO)
try:
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_visible=False, use_selection=False,
                              export_cameras=True, export_lights=False, export_yup=True, export_apply=False)
finally:
    logging.disable(logging.NOTSET)
print("GLB_KB", os.path.getsize(out) // 1024)
