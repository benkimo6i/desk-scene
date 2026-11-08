import { CONTACT, PORTFOLIO_PROJECTS, PROFILE, PROJECTS } from './content.js';

export const PAGES = {
  '/engineering': { label: 'Engineering', other: '/design', screen: 'Monitor_Screen', object: 'Monitor', pieces: 'engineering' },
  '/design': { label: 'Design', other: '/engineering', screen: 'Laptop_Screen', object: 'Laptop', pieces: 'design' },
  '/contact': { label: 'Contact', other: '/engineering', screen: 'Phone_Screen', object: 'Phone', pieces: 'contact', flat: true },
};

const NOT_FOUND = { ...PAGES['/engineering'], label: 'Not found', notFound: true };

const arrow = '<svg class="arrow" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 8.5 8.5 1.5M3 1.5h5.5V7"/></svg>';
const projectPath = (slug) => `/work/${slug}`;

function projectTile(slug, portfolio) {
  const project = PROJECTS[slug];
  return `
    <div class="block project">
      <a class="image" href="${projectPath(slug)}" data-link aria-hidden="true" tabindex="-1"><img src="${project.hero.poster ?? project.hero.src}" alt="" loading="lazy"></a>
      <h3>${project.title}</h3>
      <p>${project.summary[portfolio]}</p>
      <a class="cta" href="${projectPath(slug)}" data-link>View project ${arrow}</a>
    </div>`;
}

// Portfolio pages, or a case study. A case study keeps the portfolio it was opened from,
// so the camera knows which screen to pull back from and the back link knows where to go.
export function resolvePage(path, requestedOrigin = '/engineering') {
  if (path === '/') return null; // the desk
  if (PAGES[path]) return PAGES[path];
  const slug = path.match(/^\/work\/([a-z-]+)$/)?.[1];
  const project = slug && PROJECTS[slug];
  if (!project) return NOT_FOUND;
  const origin = project.portfolios.includes(requestedOrigin) ? requestedOrigin : project.portfolios[0];
  return { ...PAGES[origin], label: project.title, origin, caseStudy: slug };
}

const line = (text) => `<p class="reveal-item">${text}</p>`;
// Videos start and stop as they scroll in and out of view (see navigation.js).
const chat = ({ chat: turns, caption }) => `
  <figure class="chat">
    <figcaption class="reveal-item">${caption}</figcaption>
    ${turns.map(({ who, text }) => `<div class="reveal-item"><h3>${who}</h3><p>${text}</p></div>`).join('')}
  </figure>`;

const pair = ({ pair: items, caption }) => `
  <figure class="pair">
    ${items.map((item) => mediaFrame(item, item.contain ? 'contain' : '')).join('')}
    <figcaption class="reveal-item">${caption}</figcaption>
  </figure>`;

// The sketches are masks, so their line color follows the palette. Panels are numbered files.
const panel = ({ time, set, note }, i, base) => `
  <div class="reveal-item">
    <div class="sketch" role="img" aria-label="Sketch of shot ${i + 1}: ${note.replace(/'/g, '&#39;')}" style="--sketch: url(${base}/${String(i + 1).padStart(2, '0')}.webp)"></div>
    <h3>${i + 1}<span>${time}, ${set}</span></h3>
    <p>${note}</p>
  </div>`;

const board = ({ board: panels, caption }) => `
  <figure class="board">
    <figcaption class="reveal-item">${caption}</figcaption>
    <div>${panels.map((item, i) => panel(item, i, '/work/bones-like-me/board')).join('')}</div>
  </figure>`;

const media = (item, kind = '') => {
  if (item.chat) return chat(item);
  if (item.pair) return pair(item);
  if (item.board) return board(item);
  return mediaFrame(item, kind);
};
const mediaFrame = ({ src, poster, alt }, kind) => `
  <div class="media ${kind}">${src.endsWith('.mp4')
    ? `<video src="${src}" poster="${poster}" aria-label="${alt}" muted loop playsinline preload="none"></video>`
    : `<img src="${src}" alt="${alt}" loading="lazy">`}</div>`;

const outLink = ({ label, href }) => `<a class="cta reveal-item" href="${href}" target="_blank" rel="noopener noreferrer">${label} ${arrow}</a>`;
const links = (list = []) => (list.length ? `<div class="out">${list.map(outLink).join('')}</div>` : '');

const section = ({ title, body, links: sectionLinks, media: items = [] }) => `
  <div class="row">
    <h2 class="reveal-item">${title}</h2>
    <div>${line(body)}${links(sectionLinks)}</div>
  </div>
  ${items.map((item) => media(item)).join('')}`;

const credit = ({ text, by, license, href }) => `
  <p class="reveal-item">${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>` : text}, ${by}${license ? ` (${license})` : ''}</p>`;

const credits = ({ credits: list, creditsNote }) => (list ? `
  <div class="row credits">
    <h2 class="reveal-item">Credits</h2>
    <div>${list.map(credit).join('')}${creditsNote ? line(creditsNote) : ''}</div>
  </div>` : '');

function caseStudyHTML(page) {
  const base = PROJECTS[page.caseStudy];
  const project = { ...base, ...base.versions?.[page.origin] };
  const list = PORTFOLIO_PROJECTS[page.origin];
  const index = list.indexOf(page.caseStudy);
  const neighbor = (step) => list[(index + step + list.length) % list.length];
  return `
    <header>
      <a class="name" href="/" data-link>Benjamin Kim</a>
      <a class="switch" href="${page.origin}" data-link>Back to ${PAGES[page.origin].label}</a>
      <h1 tabindex="-1">${page.label}</h1>
    </header>
    <main>
      <div class="row facts">
        <div><h2 class="reveal-item">Overview</h2>${line(project.overview)}${links(project.links)}</div>
        <div class="details">
          <div><h2 class="reveal-item">Role</h2>${line(project.role)}</div>
          <div><h2 class="reveal-item">Timeline</h2>${line(project.timeline)}</div>
          <div><h2 class="reveal-item">Tools</h2>${line(project.tools.join('<br>'))}</div>
        </div>
      </div>
      ${media(project.hero, 'hero')}
      ${project.sections.map(section).join('')}
      ${credits(project)}
      <nav class="row pager" aria-label="More projects">
        ${list.length > 2 ? `<a href="${projectPath(neighbor(-1))}" data-link>Previous: ${PROJECTS[neighbor(-1)].title}</a>` : '<span></span>'}
        <a href="${projectPath(neighbor(1))}" data-link>Next: ${PROJECTS[neighbor(1)].title} ${arrow}</a>
      </nav>
    </main>`;
}

function detailsHTML(path) {
  // Job history matters to engineering readers; the design page leads with skills.
  const experience = path === '/design' ? '' : `
    <h2>Experience</h2>
    ${PROFILE.experience.map(({ role, company, years }) => `
    <div class="block entry"><h3>${role}</h3><p>${company}</p><p>${years}</p></div>`).join('')}`;
  // The landing page serves both audiences, so it carries both lists.
  const lists = path === '/' ? ['/engineering', '/design'] : [path];
  const practice = lists.map((list) => `
    <h2>${PROFILE.practice[list].heading}</h2>
    ${PROFILE.practice[list].rows.map(({ group, items }) => `
    <div class="block entry"><h3>${group}</h3><p>${items}</p></div>`).join('')}`).join('');
  return `
    ${experience}
    ${practice}`;
}

function backgroundHTML(path) {
  return `
    <h2>Background</h2>
    <p class="about">${PROFILE.about[path]}</p>
    ${detailsHTML(path)}`;
}

function contactHTML(page) {
  const links = CONTACT.links.map(({ label, text, href }) => `
    <div class="block entry"><h3>${label}</h3><p><a href="${href}">${text}</a></p></div>`).join('');
  return `
    <header>
      <a class="name" href="/" data-link>Benjamin Kim</a>
      <a class="switch" href="${page.other}" data-link>${PAGES[page.other].label}</a>
      <h1 tabindex="-1">${page.label}</h1>
    </header>
    <main>
      <section tabindex="0" aria-label="About"><h2>Get in touch</h2><p class="about">${CONTACT.intro}</p></section>
      <section tabindex="0" aria-label="Links"><h2>Links</h2>${links}</section>
    </main>`;
}

// The basic site's front page, used wherever the desk isn't served.
export const LANDING = { label: 'Benjamin Kim', title: 'Benjamin Kim | Creative Technologist' };

function notFoundHTML(page) {
  return `
    <header>
      <a class="name" href="/" data-link>Benjamin Kim</a>
      <a class="switch" href="${page.other}" data-link>${PAGES[page.other].label}</a>
      <h1 tabindex="-1">${page.label}</h1>
    </header>
    <main>
      <section tabindex="0" aria-label="Not found">
        <h2>Page not found</h2>
        <p class="about">There's nothing at this address.</p>
        <a class="cta" href="/" data-link>Back home ${arrow}</a>
      </section>
      <section aria-hidden="true"></section>
    </main>`;
}

function landingHTML() {
  const links = [['/engineering', 'Engineering'], ['/design', 'Design'], ['/contact', 'Contact']]
    .map(([href, label]) => `<a href="${href}" data-link>${label} ${arrow}</a>`).join('');
  return `
    <header><h1 tabindex="-1">${LANDING.label}</h1></header>
    <main>
      <section aria-label="Background">
        <p class="about">${PROFILE.about['/']}</p>
        <nav class="links" aria-label="Portfolios and contact">${links}</nav>
        ${detailsHTML('/')}
      </section>
    </main>`;
}

export function pageHTML(path, origin) {
  if (path === '/') return landingHTML();
  const page = resolvePage(path, origin);
  if (page.notFound) return notFoundHTML(page);
  if (page.caseStudy) return caseStudyHTML(page);
  if (path === '/contact') return contactHTML(page);
  const other = PAGES[page.other];
  return `
    <header>
      <a class="name" href="/" data-link>Benjamin Kim</a>
      <a class="switch" href="${page.other}" data-link>${other.label}</a>
      <h1 tabindex="-1">${page.label}</h1>
    </header>
    <main>
      <section tabindex="0" aria-label="Background">${backgroundHTML(path)}</section>
      <section tabindex="0" aria-label="Selected work"><h2>Selected work</h2>${PORTFOLIO_PROJECTS[path].map((slug) => projectTile(slug, path)).join('')}</section>
    </main>`;
}
