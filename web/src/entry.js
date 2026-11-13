// Shows the empty room's still and starts the room download right away, alongside the
// 3D code, so the room can draw as soon as both land.
import '@fontsource-variable/inter-tight'; // also the small-screen message's face (index.html)
import { CITIES, initialCity } from './cities.js';
import { initialPalette, setBackground } from './palettes.js';

const city = initialCity();
const palette = initialPalette(city);
setBackground(palette);
document.querySelector('#poster').style.setProperty('--poster', `url(${import.meta.env.BASE_URL}posters/${palette}.webp)`);

// Without a mouse or trackpad the page only shows the small-screen message (index.html), so
// the 3D scene isn't downloaded at all. A desktop window that's merely small still loads it,
// under the message, ready for when the window grows.
if (matchMedia('(any-pointer: fine)').matches) startScene();

function startScene() {
  const skylineFile = CITIES[city].skyline(); // small, and drawn last, so it can start now too
  const roomFile = fetch(`${import.meta.env.BASE_URL}models/room.glb`).then((response) => {
    if (!response.ok) throw new Error(`room.glb: HTTP ${response.status}`);
    return response.arrayBuffer();
  });
  import('./main.js')
    .then((module) => module.startDesk(roomFile, city, skylineFile))
    .catch((error) => console.error('The 3D desk could not start', error));
}
