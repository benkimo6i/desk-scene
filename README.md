# Desk scene

An interactive 3D desk, modeled from scratch in Blender and drawn in the browser with three.js.

- `blender/build_desk.py` builds the scene and runs `blender/build_dog.py` for the dog. Run `blender/export_desk.py` inside Blender to rebuild it, save the `.blend` and write the staged models to `web/public/models/`: `room.glb`, `desk.glb` and `details.glb`.
- `dog/build_dog_asset.py` models and rigs the dog (separate parts on one skeleton); `dog/poses.json` holds its poses, one clip each in the GLB. To pose it, exec `dog/pose_tools.py` inside Blender (its docstring has the recipes for the shipped poses), then export.
- `web/` is the Vite viewer: `npm install`, then `npm run dev` (port 5180).

The time of day follows the real sun in San Francisco. The picker in the corner switches periods, `?palette=<period>` (predawn, sunrise, morning, afternoon, sunset, night) starts on one, and `?clean` hides the picker. `web/public/posters/` holds the empty-room stills shown while the scene loads, one per period.

Things to try: hover the monitor, laptop or phone to light its screen, hover the dog, sweep the cursor over the pencils, plant, keyboard and chair, drag the pen to write on the loose sheet, and click the lamp.
