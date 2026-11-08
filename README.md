# Desk scene

An interactive 3D desk for a portfolio site, modeled from scratch.

- `blender/build_desk.py` builds the scene and runs `blender/build_dog.py` for the dog. Run `blender/export_desk.py` inside Blender to rebuild it, save the `.blend` and write the staged models to `web/public/models/`: `room.glb`, `desk.glb` and `details.glb`.
- `web/` is the Vite and three.js viewer: `npm install`, then `npm run dev` (port 5180). Add `?palette=<period>` (predawn, sunrise, morning, afternoon, sunset, night) to pick a time of day.
- `web/public/posters/` holds the empty-room stills shown while the scene loads, one per period.

This is a snapshot of the scene from the portfolio site (`portfolio-redesign-2024`, branch `2027-update`, commit 35c8ca8), where work continues. The site's own content (work-page media, favicons, share image, redirects) isn't included, so images on the work pages won't load here.
