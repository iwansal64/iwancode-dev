/**
 * All site copy lives here. PLACEHOLDER = safe to replace.
 * Role is a single editable field: the hero eyebrow and page description both
 * derive from it, so changing it once updates every place it appears.
 */
const name = 'Ridwan Bagoes Setiawan';
const role = 'Software Developer';

export const content = {
  brand: 'iwan',
  name,
  role,
  heroEyebrow: `${name} — ${role}`,
  heroLine: 'I build things for the web, and I care how they feel.',
  enterLabel: 'Enter',
  backLabel: 'Back to surface',

  about: {
    // "what it feels like" renders in the italic serif.
    headline: {
      before: "I don't just ship features. I care ",
      em: 'what it feels like',
      after: ' when they load.',
    },
    // PLACEHOLDER paragraphs
    body: [
      'I started programming because I love games and technology. Every challenge, every steep road ahead, every stuck moment, every bug — those are what make programming worth learning. What kept me here is the feeling of making something real out of nothing but an idea and a stubborn amount of focus.',
      "I'm happiest in the details: the easing on a transition, the 100ms that makes an interface feel alive, the edge case nobody asked about. Good software is mostly invisible decisions made carefully.",
      "Right now I'm exploring AI & Blockchain, and I'm building toward an AI-powered secure e-memory platform that can capture your memory by talking. This site is part of that: a place where I can treat the interface itself as the craft.",
    ],
    stats: [
      { key: 'Years coding', value: '6' },
      { key: 'Focus', value: 'AI Engineer & Fullstack Developer' },
      { key: 'Currently learning', value: 'AI & Blockchain' },
      { key: 'Base', value: 'Bekasi, Indonesia' },
      { key: 'Status', value: 'Open to work' },
    ],
    portraitLabel: 'Portrait',
  },

  hud: {
    player: 'Player 01 / iwan',
    hint: 'Scroll · Click · Hold to enter',
    hintBack: 'Scroll up · Esc · Back to surface',
    depthLabel: 'Depth',
    locked: 'Next stage — locked',
  },

  preloader: {
    // PLACEHOLDER status lines
    messages: ['Calibrating', 'Loading world', 'Ready'],
  },

  // Stage registry. Add Stage 03 by appending here + one component.
  stages: [
    { id: 'hero', label: 'Hero' },
    { id: 'about', label: 'About' },
  ],
} as const;
