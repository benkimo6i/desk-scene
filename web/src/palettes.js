// The six time-of-day periods. Their colors, sun and lamp live in palettes.json, which
// the Blender build reads too. Every visitor sees the time of day in Pacific time.
// No three.js here, so pages can use this before the 3D code loads.
import PALETTES from './palettes.json';

export { PALETTES };

export const LAMP = 4;
const STUDIO_ZONE = 'America/Los_Angeles'; // includes daylight saving

export function periodForHour(hour) {
  if (hour >= 3 && hour < 6) return 'predawn';
  if (hour >= 6 && hour < 8) return 'sunrise';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'sunset';
  return 'night';
}

function studioHour() {
  const format = new Intl.DateTimeFormat('en-US', { timeZone: STUDIO_ZONE, hour: 'numeric', hourCycle: 'h23' });
  return Number(format.format(new Date()));
}

export function initialPalette() {
  // The ?palette= preview only exists in development.
  const requested = import.meta.env.DEV ? new URLSearchParams(location.search).get('palette') : null;
  return PALETTES[requested] ? requested : periodForHour(studioHour());
}

export function setPageColors(name) {
  const { style } = document.documentElement;
  style.setProperty('--paper', PALETTES[name].paper);
  style.setProperty('--ink', PALETTES[name].ink);
}
