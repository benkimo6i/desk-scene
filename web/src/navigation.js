// Owns the URL and the page layer. The 3D desk attaches once it has loaded, so a
// direct link to a portfolio page shows immediately and never waits for the model.
import { PAGES, pageHTML, resolvePage } from './pages.js';

const FADE_MS = 180;
const HEADING_MS = 260; // when the header links start, after the h1
const COPY_START_MS = 460; // when the column copy starts
const COPY_STEP_MS = 70;

const TILE_MS = 650;
const TILE_COPY_DELAY_MS = 280; // copy starts while the tile is still growing

// Sets the fade order. Columns themselves never move. Copy in view staggers, with the
// second column running bottom to top; anything below the fold simply fades in place.
function staggerCopy(pageElement, start = 0) {
  const delay = (element, ms) => {
    element.classList.add('reveal');
    element.style.setProperty('--delay', `${start + ms}ms`);
  };
  delay(pageElement.querySelector('h1'), 0);
  pageElement.querySelectorAll('header a').forEach((link, i) => delay(link, HEADING_MS + i * 70));

  // A case study is one long column of copy, so it simply runs top to bottom.
  const longPage = pageElement.classList.contains('case');
  const columns = longPage ? [pageElement.querySelector('main')] : pageElement.querySelectorAll('section');
  columns.forEach((column, c) => {
    const limit = (longPage ? pageElement : column).getBoundingClientRect().bottom;
    const items = longPage ? [...column.querySelectorAll('.reveal-item, .pager a')] : [...column.children];
    const inView = items.filter((item) => item.getBoundingClientRect().top < limit);
    const order = c % 2 ? [...inView].reverse() : inView;
    order.forEach((item, i) => delay(item, COPY_START_MS + i * COPY_STEP_MS));
    items.slice(inView.length).forEach((item) => delay(item, COPY_START_MS));
  });
}

export function createNavigation(pageElement) {
  let desk = null;
  let showing = null;
  let hideTimer = 0;
  let origin = '/engineering'; // the portfolio a case study was opened from
  const scrollMemory = new Map(); // column positions, so returning keeps your place

  function rememberScroll() {
    if (PAGES[showing]) {
      scrollMemory.set(showing, [...pageElement.querySelectorAll('section')].map((column) => column.scrollTop));
    }
  }

  function showPage(path, revealStart = 0) {
    clearTimeout(hideTimer);
    rememberScroll();
    pageElement.classList.remove('leaving');
    if (PAGES[path]) origin = path;
    pageElement.classList.toggle('case', Boolean(resolvePage(path, origin).caseStudy));
    pageElement.innerHTML = pageHTML(path, origin);
    pageElement.hidden = false;
    pageElement.scrollTop = 0;
    scrollMemory.get(path)?.forEach((top, i) => { pageElement.querySelectorAll('section')[i].scrollTop = top; });
    staggerCopy(pageElement, revealStart);
    showing = path;
    document.title = resolvePage(path, origin).label;
  }

  // Columns fade away first, then the camera pulls back from the blank screen.
  function leavePage() {
    rememberScroll();
    pageElement.classList.add('leaving');
    showing = null;
    document.title = 'Desk scene review';
    hideTimer = setTimeout(() => {
      pageElement.hidden = true;
      pageElement.classList.remove('leaving');
      desk?.flyHome();
    }, FADE_MS);
  }

  function route(path) {
    const page = resolvePage(path, origin);
    if (page) {
      if (showing || !desk) {
        showPage(path);
        desk?.parkAt(page);
      } else {
        desk.flyTo(page, () => {
          showPage(path);
          pageElement.querySelector('h1').focus({ preventScroll: true });
        });
      }
    } else if (showing) {
      leavePage();
    } else {
      desk?.flyHome();
    }
  }

  // The clicked tile grows into the case study's hero image while everything else fades.
  function expandTile(tile, path) {
    const from = tile.getBoundingClientRect();
    const clone = document.createElement('div');
    clone.className = 'tile-clone';
    Object.assign(clone.style, {
      left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    });
    document.body.append(clone);
    tile.style.visibility = 'hidden';
    pageElement.classList.add('leaving');
    setTimeout(() => {
      showPage(path, TILE_COPY_DELAY_MS);
      const hero = pageElement.querySelector('.hero');
      const to = hero.getBoundingClientRect();
      hero.style.visibility = 'hidden';
      pageElement.querySelector('h1').focus({ preventScroll: true });
      clone.animate({
        left: [`${from.left}px`, `${to.left}px`],
        top: [`${from.top}px`, `${to.top}px`],
        width: [`${from.width}px`, `${to.width}px`],
        height: [`${from.height}px`, `${to.height}px`],
      }, { duration: TILE_MS, easing: 'cubic-bezier(0.3, 0.7, 0.1, 1)', fill: 'forwards' }).finished.finally(() => {
        hero.style.visibility = '';
        clone.remove();
      });
    }, FADE_MS);
  }

  const go = (path, tile) => {
    if (path === location.pathname) return;
    history.pushState(null, '', path);
    const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (tile && showing && motion) expandTile(tile, path);
    else route(path);
  };

  addEventListener('popstate', () => route(location.pathname));
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[data-link]');
    if (!link) return;
    e.preventDefault();
    go(link.getAttribute('href'), link.closest('.project')?.querySelector('.image'));
  });

  const start = location.pathname;
  if (resolvePage(start)) showPage(start);

  return {
    go,
    attachDesk(attached) {
      desk = attached;
      if (showing) desk.parkAt(resolvePage(showing, origin));
    },
    get onPage() { return Boolean(resolvePage(location.pathname)); },
  };
}
