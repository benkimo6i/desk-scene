import { CONTACT, PORTFOLIO_PROJECTS, PROFILE, PROJECTS } from './content.js';

export const PAGES = {
  '/engineering': { label: 'Engineering', other: '/design', screen: 'Monitor_Screen', object: 'Monitor', pieces: 'engineering' },
  '/design': { label: 'Design', other: '/engineering', screen: 'Laptop_Screen', object: 'Laptop', pieces: 'design' },
  '/contact': { label: 'Contact', other: '/engineering', screen: 'Phone_Screen', object: 'Phone', pieces: 'contact', flat: true },
};

const arrow = '<svg class="arrow" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 8.5 8.5 1.5M3 1.5h5.5V7"/></svg>';
const projectPath = (slug) => `/work/${slug}`;

function projectTile(slug, portfolio) {
  const project = PROJECTS[slug];
  return `
    <div class="block project">
      <a class="image" href="${projectPath(slug)}" data-link aria-hidden="true" tabindex="-1"></a>
      <h3>${project.title}</h3>
      <p>${project.summary[portfolio]}</p>
      <a class="cta" href="${projectPath(slug)}" data-link>View project ${arrow}</a>
    </div>`;
}

// Portfolio pages, or a case study. A case study keeps the portfolio it was opened from,
// so the camera knows which screen to pull back from and the back link knows where to go.
export function resolvePage(path, requestedOrigin = '/engineering') {
  if (PAGES[path]) return PAGES[path];
  const slug = path.match(/^\/work\/([a-z-]+)$/)?.[1];
  const project = slug && PROJECTS[slug];
  if (!project) return null;
  const origin = project.portfolios.includes(requestedOrigin) ? requestedOrigin : project.portfolios[0];
  return { ...PAGES[origin], label: project.title, origin, caseStudy: slug };
}

const line = (text) => `<p class="reveal-item">${text}</p>`;
const textRow = (title, body) => `
  <div class="row">
    <h2 class="reveal-item">${title}</h2>
    <div>${line(body)}</div>
  </div>`;
const media = () => '<div class="media"></div>';

function caseStudyHTML(page) {
  const project = PROJECTS[page.caseStudy];
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
        <div><h2 class="reveal-item">Overview</h2>${line(project.overview)}</div>
        <div class="details">
          <div><h2 class="reveal-item">Role</h2>${line(project.role)}</div>
          <div><h2 class="reveal-item">Timeline</h2>${line(project.timeline)}</div>
          <div><h2 class="reveal-item">Tools</h2>${line(project.tools.join('<br>'))}</div>
        </div>
      </div>
      <div class="media hero"></div>
      ${textRow('Problem', project.problem)}
      ${media()}
      ${textRow('Process', project.process)}
      ${media()}
      ${media()}
      ${textRow('Outcome', project.outcome)}
      <nav class="row pager" aria-label="More projects">
        <a href="${projectPath(neighbor(-1))}" data-link>Previous: ${PROJECTS[neighbor(-1)].title}</a>
        <a href="${projectPath(neighbor(1))}" data-link>Next: ${PROJECTS[neighbor(1)].title} ${arrow}</a>
      </nav>
    </main>`;
}

function backgroundHTML(path) {
  const experience = PROFILE.experience.map(({ role, company, years }) => `
    <div class="block entry"><h3>${role}</h3><p>${company}</p><p>${years}</p></div>`).join('');
  const skills = PROFILE.skills[path].map(({ group, items }) => `
    <div class="block entry"><h3>${group}</h3><p>${items}</p></div>`).join('');
  return `
    <h2>Background</h2>
    <p class="about">${PROFILE.about[path]}</p>
    <a class="cta" href="#resume" onclick="return false">Download resume ${arrow}</a>
    <h2>Experience</h2>
    ${experience}
    <h2>Skills + tools</h2>
    ${skills}`;
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

export function pageHTML(path, origin) {
  const page = resolvePage(path, origin);
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
