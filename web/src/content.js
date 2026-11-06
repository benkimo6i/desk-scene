// All placeholder copy lives here, so real content can replace it in one place.
// Companies, roles, projects and results are invented for layout review.

export const PROFILE = {
  about: {
    '/engineering': 'Creative technologist and tech lead who builds the systems behind expressive digital products. For more than a decade I have moved between code and design, leading small teams from prototype to production across real-time graphics, design tools and AI-assisted workflows.',
    '/': 'Creative technologist and tech lead working across design and engineering. For more than a decade I have built expressive digital products, from real-time graphics and design tools to brands and AI-assisted workflows.',
    '/design': 'Creative technologist and tech lead who designs with code. For more than a decade I have shaped brands, interfaces and motion systems, using prototypes as my main design material and staying close to engineering through to launch.',
  },
  experience: [
    { role: 'Tech Lead, Creative Technology', company: 'Fieldnote Labs', years: '2021 to now' },
    { role: 'Senior Creative Technologist', company: 'Halden Studio', years: '2017 to 2021' },
    { role: 'Interaction Designer and Developer', company: 'Northwise Interactive', years: '2013 to 2017' },
  ],
  skills: {
    '/': [
      { group: 'Engineering', items: 'TypeScript, Python, React, three.js, WebGPU' },
      { group: 'Design', items: 'Product, interaction, brand, type and motion' },
      { group: 'Tools', items: 'Figma, Blender, TouchDesigner, Rive, Claude' },
      { group: 'Leadership', items: 'Technical and creative direction, mentoring' },
    ],
    '/engineering': [
      { group: 'Languages', items: 'TypeScript, Python, GLSL, Swift' },
      { group: 'Graphics', items: 'three.js, WebGL, WebGPU, Blender' },
      { group: 'Systems', items: 'React, Node, Postgres, LLM tooling' },
      { group: 'Leadership', items: 'Technical direction, prototyping, mentoring' },
    ],
    '/design': [
      { group: 'Design', items: 'Product, interaction, brand and type' },
      { group: 'Motion', items: 'After Effects, Rive, Blender, shaders' },
      { group: 'Tools', items: 'Figma, TouchDesigner, Framer, Claude' },
      { group: 'Leadership', items: 'Creative direction, design systems, critique' },
    ],
  },
};

export const CONTACT = {
  intro: 'Open to tech lead and creative technologist roles, along with selected collaborations across design and engineering.',
  links: [
    { label: 'Email', text: 'hello@example.com', href: 'mailto:hello@example.com' },
    { label: 'LinkedIn', text: 'linkedin.com', href: 'https://www.linkedin.com/' },
    { label: 'GitHub', text: 'github.com', href: 'https://github.com/' },
  ],
};

export const PROJECTS = {
  'living-canvas': {
    title: 'Living Canvas',
    portfolios: ['/engineering', '/design'],
    summary: {
      '/engineering': 'A real-time generative wall, running at 60 fps across eight synchronized displays.',
      '/design': 'A generative identity that responds to the people moving through a gallery space.',
    },
    role: 'Creative and technical lead',
    timeline: '9 months, 2023',
    tools: ['WebGPU', 'TypeScript', 'TouchDesigner'],
    overview: 'A permanent generative installation for a fictional contemporary art museum. Camera tracking turns the movement of visitors into a flowing field of type and color across an entry wall.',
    problem: 'The museum wanted its identity to feel alive, but the content team had no capacity to produce new motion work. The system needed to run for years without a designer on hand, and it could never crash in front of visitors.',
    process: 'We prototyped the visual language in the browser, then rebuilt it as a GPU particle system. Designers tuned behavior through a custom control panel, while the engineering team focused on display sync, recovery and remote monitoring.',
    outcome: 'The wall has run for more than a year with no visible downtime. The same system now drives the museum\'s posters and social motion, which reduced production time for seasonal campaigns by 60 percent.',
  },
  relay: {
    title: 'Relay',
    portfolios: ['/engineering'],
    summary: { '/engineering': 'An orchestration layer for teams running long-lived AI agents in production.' },
    role: 'Tech lead',
    timeline: '14 months, 2024 to 2025',
    tools: ['TypeScript', 'Python', 'Postgres'],
    overview: 'An internal platform that lets product teams define, review and monitor multi-step agent workflows, with full traces of each decision an agent makes.',
    problem: 'Each team was building its own fragile agent scripts. Failures were hard to reproduce, costs were invisible, and nobody could explain why an agent had taken a given action.',
    process: 'I led a team of five, starting with a shared trace format and a replay tool. We then introduced durable execution, human review steps and an interface that made long runs legible to people outside engineering.',
    outcome: 'Twelve teams moved onto Relay within a year. Mean time to diagnose an agent failure fell from hours to minutes, and failed runs dropped by 45 percent.',
  },
  'spatial-kit': {
    title: 'Spatial Kit',
    portfolios: ['/engineering'],
    summary: { '/engineering': 'An open-source WebGL component library for accessible 3D product experiences.' },
    role: 'Creator and maintainer',
    timeline: 'Ongoing since 2022',
    tools: ['three.js', 'React', 'GLSL'],
    overview: 'A set of composable components for adding interactive 3D to product sites without giving up performance, keyboard support or reduced motion.',
    problem: 'Most 3D web work was rebuilt from scratch on every project, and accessibility and low-end device support were usually left until the end, if they were handled at all.',
    process: 'I extracted patterns from four client projects into a headless component model, then built a benchmark suite so that each release is tested against real mid-range phones.',
    outcome: 'The library is used in production by more than 200 teams. Typical integrations load 40 percent less code than the custom builds they replaced.',
  },
  'marrow-type': {
    title: 'Marrow Type',
    portfolios: ['/design'],
    summary: { '/design': 'A variable type system and motion language for an independent music label.' },
    role: 'Design lead',
    timeline: '7 months, 2022',
    tools: ['Figma', 'Glyphs', 'After Effects'],
    overview: 'A full identity for a fictional music label, built around a custom variable typeface whose weight and width respond to the rhythm of each release.',
    problem: 'The label released music every week, but its visual identity depended on one-off artwork. It needed a recognizable system that a small team could apply in minutes.',
    process: 'We drew a two-axis variable typeface, then mapped its axes to audio analysis. Templates turned each track into a unique but consistent cover, poster and motion loop.',
    outcome: 'Release artwork now takes under an hour. The identity gave the label a clear presence across streaming platforms and won a place in a fictional type design annual.',
  },
  tempo: {
    title: 'Tempo',
    portfolios: ['/design'],
    summary: { '/design': 'A browser-based motion tool that makes keyframing feel like playing an instrument.' },
    role: 'Product design lead',
    timeline: '11 months, 2024',
    tools: ['Figma', 'Rive', 'React'],
    overview: 'A motion design tool for product teams, with a timeline that can be performed live as well as edited frame by frame.',
    problem: 'Designers found traditional timelines slow and intimidating, so motion was often left until the end of a project and handed off as a vague note to engineering.',
    process: 'We tested dozens of interaction prototypes with working designers, and landed on a scrubbing model that records gestures as editable curves. Every control was built and refined in code.',
    outcome: 'In a beta with 300 designers, time to a first finished animation fell by half, and 70 percent of participants kept using the tool after the trial ended.',
  },
};

export const PORTFOLIO_PROJECTS = {
  '/engineering': ['living-canvas', 'relay', 'spatial-kit'],
  '/design': ['living-canvas', 'marrow-type', 'tempo'],
};
