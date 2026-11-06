// Pages come first and never depend on 3D. A direct link shows at once, and the
// site still works in a browser without WebGL. The desk code loads after that.
import '@fontsource-variable/inter-tight';
import { createNavigation } from './navigation.js';
import { initialPalette, setPageColors } from './palettes.js';

// Colors are set first, so pages are right from the first paint, with or without 3D.
setPageColors(initialPalette());
const navigation = createNavigation(document.querySelector('#page'));
const loadDesk = () => import('./main.js')
  .then(({ startDesk }) => startDesk(navigation))
  .catch((error) => console.error('The 3D desk could not start', error));

if (navigation.onPage) (window.requestIdleCallback ?? setTimeout)(loadDesk);
else loadDesk();
