// Pages come first and never depend on 3D. A direct link shows at once, and the
// site still works in a browser without WebGL. The desk code loads after that.
import '@fontsource-variable/inter-tight';
import { createNavigation } from './navigation.js';
import { initialPalette, setPageColors } from './palettes.js';

// The desk needs a cursor and enough width to frame it. Everything else gets the basic site,
// and never downloads the 3D code.
const DESK_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 900px) and (min-aspect-ratio: 9/8)';

// Colors are set first, so pages are right from the first paint, with or without 3D.
setPageColors(initialPalette());
const deskQuery = matchMedia(DESK_QUERY);
const navigation = createNavigation(document.querySelector('#page'), !deskQuery.matches);

let desk = null;
const loadDesk = () => {
  desk ??= import('./main.js')
    .then((module) => {
      module.startDesk(navigation);
      return module;
    })
    .catch((error) => console.error('The 3D desk could not start', error));
  return desk;
};

deskQuery.addEventListener('change', async () => {
  navigation.setBasic(!deskQuery.matches);
  if (deskQuery.matches) (await loadDesk())?.setDeskActive(true);
  else (await desk)?.setDeskActive(false);
});

if (deskQuery.matches) {
  if (navigation.onPage) (window.requestIdleCallback ?? setTimeout)(loadDesk);
  else loadDesk();
}
