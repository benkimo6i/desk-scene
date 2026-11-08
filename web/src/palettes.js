// The six time-of-day periods. Their colors, sun and lamp live in palettes.json, which
// the Blender build reads too. Every visitor sees the studio's sky in San Francisco.
// No three.js here, so entry.js can use this before the 3D code loads.
import PALETTES from './palettes.json';

export { PALETTES };

export const LAMP = 4;
const STUDIO_ZONE = 'America/Los_Angeles'; // the studio's calendar date, daylight saving included
const STUDIO = { lat: 37.7749, lon: -122.4194 }; // San Francisco, as in the window

const DAY_MS = 86400000;
const rad = Math.PI / 180;
const toJulian = (ms) => ms / DAY_MS + 2440587.5;
const fromJulian = (j) => (j - 2440587.5) * DAY_MS;

// Today's sunrise, solar noon and sunset at the studio, as instants (the sunrise equation,
// accurate to a minute or two, which is plenty here).
function sunTimes(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: STUDIO_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  const n = Math.round(toJulian(Date.UTC(parts.year, parts.month - 1, parts.day, 12)) - 2451545); // days since 2000-01-01 noon
  const meanNoon = n - STUDIO.lon / 360;
  const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
  const centre = 1.9148 * Math.sin(anomaly * rad) + 0.02 * Math.sin(2 * anomaly * rad) + 0.0003 * Math.sin(3 * anomaly * rad);
  const longitude = (anomaly + centre + 180 + 102.9372) % 360;
  const transit = 2451545 + meanNoon + 0.0053 * Math.sin(anomaly * rad) - 0.0069 * Math.sin(2 * longitude * rad);
  const declination = Math.asin(Math.sin(longitude * rad) * Math.sin(23.4397 * rad));
  const hourAngle = Math.acos((Math.sin(-0.833 * rad) - Math.sin(STUDIO.lat * rad) * Math.sin(declination))
    / (Math.cos(STUDIO.lat * rad) * Math.cos(declination))) / rad;
  return { sunrise: fromJulian(transit - hourAngle / 360), noon: fromJulian(transit), sunset: fromJulian(transit + hourAngle / 360) };
}

// The periods sit around the real sun at the studio, so they follow the seasons: each is a
// start, in minutes from sunrise, solar noon or sunset. Night is whatever is left.
const MINUTE = 60000;
export function periodAt(now = new Date()) {
  const { sunrise, noon, sunset } = sunTimes(now);
  const t = now.getTime();
  if (t >= sunrise - 135 * MINUTE && t < sunrise - 45 * MINUTE) return 'predawn';
  if (t >= sunrise - 45 * MINUTE && t < sunrise + 75 * MINUTE) return 'sunrise';
  if (t >= sunrise + 75 * MINUTE && t < noon) return 'morning';
  if (t >= noon && t < sunset - 90 * MINUTE) return 'afternoon';
  if (t >= sunset - 90 * MINUTE && t < sunset + 40 * MINUTE) return 'sunset';
  return 'night';
}

// ?palette=<period> picks a period; otherwise it follows the sun.
export function initialPalette() {
  const requested = new URLSearchParams(location.search).get('palette');
  return PALETTES[requested] ? requested : periodAt();
}

// The page behind the canvas, seen until the room has drawn.
export function setBackground(name) {
  document.documentElement.style.setProperty('--ink', PALETTES[name].ink);
}
