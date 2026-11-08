// All site copy lives here.

export const PROFILE = {
  about: {
    '/engineering': 'Creative technologist and tech lead who builds the systems behind expressive digital products. For a decade I have worked with brands like Apple, UNICEF and Ford, from early prototypes to production design systems.',
    '/': 'Creative technologist and tech lead working across design and engineering. For a decade I have built expressive digital products for brands like Apple, UNICEF and Ford, from early prototypes to production design systems.',
    '/design': 'Creative technologist with a decade of building for the web, now working across design, motion and film.',
  },
  experience: [
    { role: 'Technology Lead', company: 'Critical Mass', years: '2025 to now' },
    { role: 'Senior Developer', company: 'Critical Mass', years: '2022 to 2025' },
    { role: 'Developer', company: 'Critical Mass', years: '2020 to 2022' },
    { role: 'Developer', company: 'Blue State Digital', years: '2016 to 2020' },
  ],
  // Kept high level on purpose: specific tools are named in each case study.
  practice: {
    '/engineering': {
      heading: 'Stack',
      rows: [
        { group: 'Interactive', items: '3D, motion and gesture-driven interfaces' },
        { group: 'Frontend', items: 'Design systems, accessibility and web performance' },
        { group: 'Pipeline', items: 'Asset optimization and delivery, from 3D source to browser' },
        { group: 'AI', items: 'Agentic workflows and AI-assisted development' },
        { group: 'Leadership', items: 'Technical direction, prototyping and mentoring' },
      ],
    },
    '/design': {
      heading: 'Practice',
      rows: [
        { group: 'Direction', items: 'Art direction and visual systems' },
        { group: 'Interaction', items: 'Interaction and interface design' },
        { group: 'Motion', items: 'Animation, timing and motion design' },
        { group: 'Spatial', items: '3D scenes, lighting and camera' },
        { group: 'Production', items: 'Rendering, VFX and post-production' },
      ],
    },
  },
};

export const CONTACT = {
  intro: 'Open to tech lead and creative technologist roles, along with selected collaborations across design and engineering.',
  links: [
    { label: 'Email', text: 'benjaminkimco@gmail.com', href: 'mailto:benjaminkimco@gmail.com' },
    { label: 'LinkedIn', text: 'linkedin.com/in/benkimco', href: 'https://www.linkedin.com/in/benkimco/' },
    { label: 'GitHub', text: 'github.com/benkimo6i', href: 'https://github.com/benkimo6i' },
  ],
};

// A project's hero and each section's media take { src, alt }, plus a poster for video.
// Section media can also be { chat, caption }, a real quoted excerpt from a working session;
// { pair, caption }, two images side by side; or { board, caption }, a numbered shot breakdown.
// The hero's poster (or image) doubles as the portfolio tile. Clips are silent.
export const PROJECTS = {
  'product-carousel': {
    title: '3D Product Carousel',
    portfolios: ['/engineering', '/design'],
    summary: {
      '/engineering': 'An exploration of how frontend workflows may change, using Blender MCP and agents to extend one engineer across the 3D, interactive and frontend layers.',
      '/design': 'A product page concept that mixes print nostalgia with 3D, so the product becomes the interface rather than a static shot.',
    },
    timeline: 'October 2026',
    links: [
      { label: 'Live demo', href: 'https://benkimo6i.github.io/3d-product-carousel/' },
      { label: 'Source', href: 'https://github.com/benkimo6i/3d-product-carousel' },
    ],
    hero: { src: '/work/product-carousel/scroll.mp4', poster: '/work/product-carousel/hero.webp', alt: 'Scrolling through the carousel, from a yellow MacBook Neo to an iMac and iPhone.' },
    // The page tells a different story depending on the portfolio it was opened from.
    versions: {
      '/engineering': {
        role: 'Technical direction',
        tools: ['React Three Fiber', 'three.js', 'GSAP', 'zustand', 'glTF Transform', 'KTX2 and Meshopt', 'Blender', 'MCP for Blender', 'Claude Code'],
        overview: 'A concept inspired by Apple product pages, not commissioned by Apple. It explores how a frontend workflow might change when agents can work across layers an engineer would usually hand off, including 3D.',
        sections: [
          {
            title: 'Idea',
            body: 'Using my background in engineering and self-taught Blender skills, I set out to explore what Blender MCP could do and where it could save time: which parts of a 3D web build could I direct and augment, and which could I offload? I treated it as an experiment rather than a conclusion.',
          },
          {
            title: 'Technical direction',
            body: 'This piece is half 3D scene and half web page, so I chose React Three Fiber to keep both in one React app. The scene is written as components, each owning its own state and per-frame logic, while copy and controls stay ordinary HTML and CSS. The carousel is driven by a JSON manifest, and each product loads behind its own Suspense and error boundary, so models stream in independently and fail alone.',
          },
          {
            title: 'Pipeline',
            body: 'The first phase happened entirely in Blender. I set the direction and reviewed renders, and Claude did the hands-on work through MCP: auditing models, rebuilding materials, rigging lids and exporting each product twice, as a light carousel version and a full-detail version. One optimize script then handles the rest, encoding textures as KTX2 and compressing geometry with Meshopt, so re-exporting and re-running it is the whole update loop.',
          },
          {
            title: 'Interactive',
            body: 'The page scroll is the single source of truth. GSAP ScrollTrigger maps it to the row position, and scrolling, swiping, snapping and the paddles all end up as a change to that one value. A single camera orbits its target in spherical coordinates, so opening a product is an arc rather than a straight dolly. The canvas renders on demand, drawing only while something moves.',
            media: [{ src: '/work/product-carousel/details.mp4', poster: '/work/product-carousel/details.webp', alt: 'Opening the MacBook Pro details view, turning it with a drag, and waking its screen to a mock desktop.' }],
          },
          {
            title: 'Frontend',
            body: 'The layout leads and the 3D follows. The details view is real HTML and CSS with an empty slot, and each frame the camera measures that slot and fits the product to it, so restyling a breakpoint just works. Details is a proper modal dialog, with keyboard and screen reader support, AA contrast and reduced motion.',
          },
          {
            title: 'Agents',
            body: 'The working rhythm was a tight loop: I gave references and annotated screenshots, Claude asked clarifying questions, then made a change and verified it in a real browser. That was how the harder bugs got found. A sideways swipe that felt like a tug-of-war, for example, came down to a snap starting during a 250 ms pause mid-gesture, which showed up only when we simulated the swipe.',
          },
          {
            title: 'Result',
            body: 'A public demo with six products that works across desktop, tablet and phone. My takeaway is measured: this did not replace 3D artists or motion designers, and one project proves little on its own. It does suggest that the leverage in frontend work may move toward framing problems clearly and judging results, and I am continuing to explore what that means in practice.',
          },
        ],
      },
      '/design': {
        role: 'Creative direction and experience design',
        tools: ['Blender', 'Cycles', 'MCP for Blender', 'Claude Code', 'Sketchfab'],
        overview: 'A concept inspired by Apple product pages, not commissioned by Apple. It imagines a future product page that mixes nostalgia with 3D, where you handle a live object instead of scrolling past static shots.',
        sections: [
          {
            title: 'Idea',
            body: 'This began as an attempt to envision future UI patterns. Product pages mostly present products as photography, and I wanted to treat the product as the interface. Nostalgia gave me a way in: a 1979 Heathkit print ad, with the product dead center under a big headline and copy set in columns. A familiar composition slows people down, and pairing it with crisp modern 3D keeps it from becoming pastiche.',
            media: [{
              caption: 'Layout reference: Heathkit H89 ad, Heath Company, <a href="https://archive.org/details/byte-magazine-1979-09/page/n18/mode/1up" target="_blank" rel="noopener noreferrer">BYTE, September 1979, p. 17</a>. The finished details view, right.',
              pair: [
                { src: '/work/product-carousel/heathkit-h89.webp', contain: true, alt: 'A 1979 Heathkit H89 print ad: a large headline, the computer front-on in the center, and columns of copy below.' },
                { src: '/work/product-carousel/details-awake.webp', alt: 'The details view: a big headline, copy columns on both sides, and a MacBook Pro front-on showing a mock desktop.' },
              ],
            }],
          },
          {
            title: 'Art direction',
            body: 'Two references shaped the look. Modern product pages set the tone of the carousel: a quiet light gray stage, confident type, and one product in focus with its neighbors at the edges. The print ad set the structure of the details view, adapted for a wide screen with the copy moved to either side of the product. I took only the composition, leaving behind the backdrop and period type.',
          },
          {
            title: 'Layout and type',
            body: 'Each details view reads like a magazine spread: a large headline, a one-line subline and three short copy blocks on each side. The placeholder copy was written to the shape of that layout, and the composition carries from a three-column spread on desktop to a product beside a scrolling column on tablets and a stacked page on phones.',
            media: [{ src: '/work/product-carousel/imac.webp', alt: 'A blue iMac centered on a light gray stage, with its neighbors just in view.' }],
          },
          {
            title: 'Graphics production',
            body: 'The products came from different Sketchfab artists, so I chose the models and directed a shared material library to make them read as one family under one light: finishes, glass, satin and matte blacks, and emissive screens. Every product is scaled to fill about the same space on stage, shot with a long-lens camera and a soft key light, and grounded with soft shadows baked in Cycles. The mock desktops on each screen are original placeholder UI, laid out over each device\'s wallpaper.',
            media: [{ src: '/work/product-carousel/details.webp', alt: 'The MacBook Pro details view, with the product front-on between columns of copy.' }],
          },
          {
            title: 'Result',
            body: 'A cohesive set of six products in a single visual language, and a working argument for the original idea: a page composed like print, where the product itself is what you interact with.',
          },
        ],
      },
    },
    credits: [
      { text: 'MacBook Neo', by: 'Ranguel', license: 'CC BY 4.0', href: 'https://sketchfab.com/3d-models/macbook-neo-f3dd26684f114b1baffd1b0800876627' },
      { text: 'MacBook Pro 14-inch M5', by: 'Apple User', license: 'Sketchfab Free Standard', href: 'https://sketchfab.com/3d-models/macbook-pro-14-inch-m5-652a992f4f244122ae251f9cbb81da1e' },
      { text: 'MacBook Pro M3 16-inch 2024', by: 'jackbaeten', license: 'CC BY 4.0', href: 'https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4' },
      { text: 'iMac 2021', by: 'DatSketch', license: 'CC BY 4.0', href: 'https://sketchfab.com/3d-models/imac-2021-304cb06ffb554883a7a642b2b56754c1' },
      { text: 'iPhone 17 Pro', by: 'Ranguel', license: 'CC BY 4.0', href: 'https://sketchfab.com/3d-models/iphone-17-pro-4541aa8a28324b33a2baaf81d263aaec' },
      { text: 'Apple Watch Ultra 2', by: 'polyman Studio', license: 'CC BY 4.0', href: 'https://sketchfab.com/3d-models/apple-watch-ultra-2-f33263c457664b43909200c5ed5e6fa2' },
      { text: 'AirPods (3e génération)', by: 'polyman Studio', license: 'CC BY 4.0', href: 'https://sketchfab.com/3d-models/ed331e742ab944e683dcddd59ab0713e' },
    ],
    creditsNote: 'Models were reshaded and optimized for this demo.',
  },
  'motion-experiments': {
    title: 'Motion Experiments',
    portfolios: ['/engineering'],
    summary: { '/engineering': 'Three browser experiments in physics, gesture and camera input: a throwable 404, a UI that reads your face, and a virtual&nbsp;try-on.' },
    role: 'Concept, design and development',
    timeline: 'July to September 2026',
    tools: ['three.js', 'MediaPipe Tasks Vision', 'WebGL shaders', 'Web Audio'],
    links: [
      { label: 'All demos', href: 'https://benkimo6i.github.io/motion-experiments/' },
      { label: 'Source', href: 'https://github.com/benkimo6i/motion-experiments' },
    ],
    overview: 'A collection of small, self-contained pieces that explore physics, gesture and playful UI. All three run in the browser, and the camera is optional: each one can be tried without it.',
    hero: { src: '/work/motion-experiments/hero.webp', alt: 'The Mood UI demo: a card over a blue and violet ambient shader.' },
    sections: [
      {
        title: 'Idea',
        body: 'After building an AR prototype for work with 8th Wall, I wanted to explore more computer vision technology. These experiments use MediaPipe to look for practical use cases in web UI, and for ways camera input could improve on or innovate in the user experience.',
      },
      {
        title: '404 Stress Ball',
        body: 'A 3D stress ball floating over a broken 404 page. Squeeze it, throw it and watch the letters spit out of the page. With a camera, MediaPipe hand tracking turns a pinch into a squeeze and a fling into a throw. Without one, it falls back to the mouse. This one explores the extent of immersive web experiences more than a practical pattern, since camera setup is a barrier to casual use.',
        links: [{ label: 'Try it', href: 'https://benkimo6i.github.io/motion-experiments/404/' }],
        media: [{ src: '/work/motion-experiments/404.mp4', poster: '/work/motion-experiments/404.webp', alt: 'A ball squeezed flat, then thrown at a 404 page, knocking its letters loose.' }],
      },
      {
        title: 'Mood UI',
        body: 'A library that reads facial expressions and drives UI from them, inspired by micro-expressions in psychology. MediaPipe Face Landmarker scores the face every frame, heuristics roll those scores into happy, sad and angry moods, and any element can declare which moods it reacts to. Smoothing and a short hold keep brief movements from flickering the UI. I can see this approach feeding hyperpersonalization or generative UI, though camera access raises real privacy and security barriers.',
        links: [{ label: 'Try it', href: 'https://benkimo6i.github.io/motion-experiments/mood-ui/' }],
        media: [{ src: '/work/motion-experiments/mood.mp4', poster: '/work/motion-experiments/mood.webp', alt: 'Switching between happy, sad and angry, as the ambient shader morphs from green to blue to red.' }],
      },
      {
        title: 'Product Mirror',
        body: 'A demo storefront for virtual try-on, not affiliated with any eyewear brand. It anchors 3D glasses to your face in real time, so shoppers can spin a product to inspect it and then see it worn. One shared tracking engine is reference-counted across every tile, so opening try-on on several cards never starts more than one camera stream or model. This is the most practical of the three, and retailers like Warby Parker have used the technology on their sites.',
        links: [{ label: 'Try it', href: 'https://benkimo6i.github.io/motion-experiments/product-mirror/' }],
        media: [{ src: '/work/motion-experiments/mirror.mp4', poster: '/work/motion-experiments/mirror.webp', alt: 'Spinning a pair of glasses by drag, switching category, and scrolling down to the product cards.' }],
      },
      {
        title: 'Result',
        body: 'Three live demos, and one clear finding: computer vision in the browser works, and the deciding factor is whether the value justifies asking for the camera. Try-on clearly does. Immersive play and mood-driven interfaces are compelling to explore, but camera setup and privacy stand in the way of everyday use for now.',
      },
    ],
  },
  'bones-like-me': {
    title: 'Bones Like Me',
    portfolios: ['/design'],
    summary: { '/design': 'An animated noir music video where a skeleton jazz band plays so hard it wakes the graveyard, made to demonstrate Blender MCP for short film production.' },
    role: 'Creative director and producer',
    timeline: 'October 2026',
    tools: ['Blender', 'MCP for Blender', 'Claude', 'Sketchfab'],
    links: [],
    overview: 'An animated noir music video for "Wolf Like Me" by TV on the Radio, unofficial and not affiliated with the band. A skeleton jazz band starts its set in a smoky club, and the dead rise from the graveyard to join it. A demonstration of Blender MCP for short film production, shared across my creative technology department.',
    hero: { src: '/work/bones-like-me/band.mp4', poster: '/work/bones-like-me/hero.webp', alt: 'The skeleton band playing on a glowing summoning circle in a candlelit club.' },
    sections: [
      {
        title: 'Idea',
        body: 'The brief was to explore Blender MCP on a real production, applying my Blender experience by directing Claude rather than working every control by hand. It began with a single scene, a slow dolly out of a skeleton\'s face into a band in a smoky club. That scene became the intro, and the story was built around it.',
        media: [{ src: '/work/bones-like-me/skull.webp', alt: 'Extreme close-up of a skull with glowing teal eyes, the opening shot of the intro.' }],
      },
      {
        title: 'Pre-production',
        body: 'With the intro in place, we planned the rest like a production: set creation, shot planning, camera direction and pacing. Three sets (a club, a graveyard and a summoning circle in a black void) share one Blender file, and the shot list was cut to the song\'s 16-beat phrases. Asset planning followed the camera, so nothing was built for a frame that would never see it.',
        media: [
          {
            caption: 'From the planning chat',
            chat: [
              { who: 'Ben', text: 'i want to add more scenes to the video, up until we reach the end of the first chorus of the song, how many seconds is that, also if want to add more scenes to the video do i setup a new project/file?' },
              { who: 'Claude', text: 'The chorus ends at 1:19. The video currently ends at 0:32 in the song, so there are ~47 s (~1,130 frames) of new footage to make. [...] everything stays in this one file, as three scenes [...] The song moves in 16-beat phrases (~5.5 s), so I\'ve cut on those.' },
            ],
          },
          {
            caption: 'From the set-building chat',
            chat: [
              { who: 'Ben', text: 'seems like a waste to paint tombstones, trees, mausoleums behind the camera that won\'t be in line with where the camera is pointing to?' },
              { who: 'Claude', text: 'I checked every frame of every graveyard camera [...] 28 of the 56 cards never came into view, mostly the ones to the south behind the cameras, so I deleted them.' },
            ],
          },
          {
            caption: 'Shot breakdown',
            board: [
              { time: '0:02', set: 'Club', note: 'Extreme close-up. Eyes flicker on with the beat, then a dolly zoom out.' },
              { time: '0:10', set: 'Club', note: 'Camera arcs across the band, holding on each face.' },
              { time: '0:17', set: 'Graveyard', note: 'Whip into a crane shot descending toward the coffin.' },
              { time: '0:23', set: 'Graveyard', note: 'Lid pops on the beat. Camera jolts back like a handheld reaction.' },
              { time: '0:24', set: 'Graveyard', note: 'Quick cut to the arm breaking out, dust hanging in the air.' },
              { time: '0:27', set: 'Graveyard', note: 'Low Dutch angle. The skeleton stands and turns toward the glow.' },
              { time: '0:30', set: 'Graveyard', note: 'Crane back to reveal the dead walking toward the crypt.' },
              { time: '0:32', set: 'Circle', note: 'Solos begin. Whip pans around the band, one member at a time.' },
              { time: '0:38', set: 'Circle', note: 'Locked to the guitar neck as the fingers work the frets.' },
              { time: '0:46', set: 'Graveyard', note: 'Crypt doors blast open with a shockwave.' },
              { time: '0:53', set: 'Club', note: 'Band wide on the circle, then tight pairs and rapid cuts.' },
              { time: '1:03', set: 'Graveyard', note: 'Crypt explodes. Cut to the bass player\'s eyes flaring out.' },
            ],
          },
          { src: '/work/bones-like-me/graveyard.mp4', poster: '/work/bones-like-me/graveyard-poster.webp', alt: 'A long camera move down through a misty graveyard to a coffin as its lid begins to stir.' },
        ],
      },
      {
        title: 'Production',
        body: 'My background in photography and filmmaking drove the camera language: dolly zooms, crane moves, low Dutch angles, a handheld reaction as the coffin lid pops, and whip pans that hide cuts between sets. For movement, we chose the technique per shot. The band and crowd run on quick stop-motion pose swaps with offset timing, so nothing moves in sync, and a rig came in only where a shot needed one. VFX covered volumetric fog, teal ghost trails on the band, mesh-based cigarette smoke, coffin dust and an exploding crypt built from 117 fractured pieces.',
        media: [
          { src: '/work/bones-like-me/hand.webp', alt: 'A skeletal hand reaching up out of a coffin against a teal sky.' },
          { src: '/work/bones-like-me/solos.mp4', poster: '/work/bones-like-me/solos.webp', alt: 'Whip pans around the summoning circle between the pianist and drummer.' },
        ],
      },
      {
        title: 'World building and rendering',
        body: 'Performance shaped the sets. Animated models were kept to what the camera needed, while seated poses were baked into static meshes instead of live rigs, and distant trees, mausoleums and tombstones became painted 2D cards. Render tests showed the main cost was shadow maps from many small candle lights rather than the fog, so we merged lights and removed shadows from the summoning circle candles, saving about 21% per club frame with no visible change. Rendering each set separately meant only changed shots needed re-rendering, and the final 1,621 frames rendered at 1080p in about two and a half hours.',
        media: [{ src: '/work/bones-like-me/fret.webp', alt: 'Close on skeletal fingers on a guitar neck, with the glowing circle behind.' }],
      },
      {
        title: 'Result',
        body: 'A 1 minute 22 second music video at 1080p, and a working demonstration of Blender MCP for short film production. It blended my photography and filmmaking experience with an MCP-directed workflow that augmented animation, VFX and rendering, and it lays the groundwork for future short films in Blender.',
      },
    ],
    credits: [
      { text: 'Music: "Wolf Like Me"', by: 'TV on the Radio' },
      { text: 'Timeframe Skeleton Orchestra', by: 'Jorma Rysky', license: 'CC BY', href: 'https://sketchfab.com/3d-models/c223cd775f924a2599d36daad83fe02e' },
      { text: 'Casino Dung Roller-Game', by: 'Jorma Rysky', license: 'CC BY', href: 'https://sketchfab.com/3d-models/64a1c665866148fe94295b9cf488f8d8' },
      { text: 'Low poly Coffin', by: 'Jorma Rysky', license: 'CC BY', href: 'https://sketchfab.com/3d-models/d7d2595ba1104e1d898e23b5683c0d87' },
      { text: 'Implosion of a Tombstone', by: 'KWARE DESIGN', license: 'CC BY', href: 'https://sketchfab.com/3d-models/d8aa76059dba4c2ba7fbc2d84d280029' },
      { text: 'Candles and Tombstones', by: 'N01516', license: 'CC BY', href: 'https://sketchfab.com/3d-models/4606c83c372046cb92359a568e0e6d99' },
      { text: 'Inktober - Day 7 - Enchanted', by: 'Taylor C', license: 'CC BY-NC', href: 'https://sketchfab.com/3d-models/9fb858342873428da359890c9e08a068' },
      { text: 'Animation, lighting and effects', by: 'Claude' },
    ],
    creditsNote: 'Models via Sketchfab, adapted for this film.',
  },
};

export const PORTFOLIO_PROJECTS = {
  '/engineering': ['product-carousel', 'motion-experiments'],
  '/design': ['bones-like-me', 'product-carousel'],
};
