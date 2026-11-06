// Six time-of-day palettes, chosen from the visitor's local clock when the page opens.
// No three.js here, so pages can use this before the 3D code loads.

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const [x, y] = [toRgb(a), toRgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

// Paper and print colors are mixed from each period's light and shadow. Each entry is lit, shadow, deep.
function materialsFrom({ lit, shadow, deep, darkest, green, accent }) {
  return {
    M_Main: [lit, shadow, deep],
    M_Paper: [mix(lit, shadow, 0.12), mix(shadow, lit, 0.45), mix(shadow, lit, 0.32)],
    M_Blueprint: [mix(lit, shadow, 0.2), mix(shadow, lit, 0.38), mix(shadow, lit, 0.26)],
    M_Sheet: [mix(lit, shadow, 0.06), mix(shadow, lit, 0.52), mix(shadow, lit, 0.42)],
    M_Dark: [shadow, deep, darkest],
    M_Green: green,
    M_Accent: accent,
  };
}

const CORAL = ['#D9553B', '#A8402F', '#8E3528'];
const SUN = 8;
export const LAMP = 4;
const STUDIO_ZONE = 'America/Los_Angeles'; // Pacific time, including daylight saving
// Where the sun sits, as a direction from the room (x toward the window side, y up, z toward
// the camera). The hidden room shell in main.js makes sure it only enters through the window.
const SUN_PATH = {
  sunrise: [-1, 0.24, 0.3],
  morning: [-1, 0.42, 0.55],
  afternoon: [-1, 0.55, 0.8],
  sunset: [-1, 0.2, 0.95],
};

// Builds a period from its swatches. Darker periods get dark pages and the desk lamp.
function period(label, { lit, shadow, deep, sky, sunFrom, lamp = 0, dark = false, green, accent = CORAL }) {
  const darkest = mix(deep, '#000000', 0.3);
  return {
    label,
    sky,
    screen: mix(lit, '#FFFFFF', 0.4),
    line: mix(deep, '#000000', 0.55),
    paper: dark ? deep : lit,
    ink: dark ? lit : shadow,
    skyline: [mix(sky, shadow, 0.25), mix(sky, shadow, 0.55), mix(sky, shadow, 0.85)],
    sun: lamp ? 0 : SUN,
    sunFrom,
    lamp,
    bulb: lit,
    materials: materialsFrom({ lit, shadow, deep, darkest, accent, green: green ?? [mix('#9DBB9A', lit, 0.2), mix('#4F7F62', shadow, 0.3), mix('#3E6B54', deep, 0.4)] }),
  };
}

export const PALETTES = {
  predawn: period('Pre-dawn', { lit: '#E8B7A5', shadow: '#3A3F6B', deep: '#1B1F3B', sky: '#6B6A9E', sunFrom: SUN_PATH.sunrise, lamp: LAMP, dark: true }),
  sunrise: period('Sunrise', { lit: '#FFE8C2', shadow: '#3D4E81', deep: '#2F3D69', sky: '#F4A6A0', sunFrom: SUN_PATH.sunrise }),
  morning: {
    label: 'Morning',
    sky: '#E2F0F8', screen: '#EDF5F9', line: '#0D2C4A', paper: '#F3EEDF', ink: '#1F6AA8',
    skyline: ['#C6DDEE', '#92BCDC', '#4C86B8'], sun: SUN, sunFrom: SUN_PATH.morning, lamp: 0, bulb: '#F3EEDF',
    materials: materialsFrom({ lit: '#F3EEDF', shadow: '#2F7FC1', deep: '#2369A6', darkest: '#1A5488', green: ['#A4C4A0', '#4F8A74', '#3F7464'], accent: CORAL }),
  },
  afternoon: {
    label: 'Afternoon',
    sky: '#DCE8F1', screen: '#E0EAF3', line: '#06203F', paper: '#EFE6D2', ink: '#0B4C92',
    skyline: ['#B5CCE2', '#7FA3CB', '#2F5F9A'], sun: SUN, sunFrom: SUN_PATH.afternoon, lamp: 0, bulb: '#EFE6D2',
    materials: {
      M_Main: ['#EFE6D2', '#0B4C92', '#083A72'],
      M_Paper: ['#C5D6E6', '#7FA0C4', '#6688AE'],
      M_Blueprint: ['#B9C8D8', '#6F90B6', '#5C7DA3'],
      M_Sheet: ['#DCE2E6', '#94ACC8', '#7C96B4'],
      M_Dark: ['#0B4C92', '#083A72', '#062C58'],
      M_Green: ['#9DBB9A', '#4F7F62', '#3E6B54'],
      M_Accent: CORAL,
    },
  },
  sunset: period('Sunset', { lit: '#FFE3A3', shadow: '#4A5D8C', deep: '#394974', sky: '#F6C177', sunFrom: SUN_PATH.sunset }),
  night: period('Night', { lit: '#F2C57C', shadow: '#24366B', deep: '#0F1A3D', sky: '#4A6FA5', sunFrom: SUN_PATH.afternoon, lamp: LAMP, dark: true }),
};

export function periodForHour(hour) {
  if (hour >= 3 && hour < 6) return 'predawn';
  if (hour >= 6 && hour < 8) return 'sunrise';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'sunset';
  return 'night';
}

// Every visitor sees the time of day at the studio, wherever they are.
function studioHour() {
  const format = new Intl.DateTimeFormat('en-US', { timeZone: STUDIO_ZONE, hour: 'numeric', hourCycle: 'h23' });
  return Number(format.format(new Date()));
}

export function initialPalette() {
  const requested = new URLSearchParams(location.search).get('palette');
  return PALETTES[requested] ? requested : periodForHour(studioHour());
}

export function setPageColors(name) {
  const { style } = document.documentElement;
  style.setProperty('--paper', PALETTES[name].paper);
  style.setProperty('--ink', PALETTES[name].ink);
}
