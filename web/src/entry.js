// Shows the empty room's still and starts the room download right away, alongside the
// 3D code, so the room can draw as soon as both land.
import { initialPalette, setBackground } from './palettes.js';

const palette = initialPalette();
setBackground(palette);
document.querySelector('#poster').style.setProperty('--poster', `url(${import.meta.env.BASE_URL}posters/${palette}.webp)`);

const roomFile = fetch(`${import.meta.env.BASE_URL}models/room.glb`).then((response) => {
  if (!response.ok) throw new Error(`room.glb: HTTP ${response.status}`);
  return response.arrayBuffer();
});
import('./main.js')
  .then((module) => module.startDesk(roomFile))
  .catch((error) => console.error('The 3D desk could not start', error));
