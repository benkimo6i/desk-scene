# Desk scene

An interactive 3D desk for a portfolio site, modeled from scratch.

- `blender/build_desk.py` builds the scene. Run `blender/export_desk.py` inside Blender to rebuild it, save the `.blend` and write `web/public/models/desk.glb`.
- `web/` is the Vite and three.js viewer: `npm install`, then `npm run dev` (port 5180).
