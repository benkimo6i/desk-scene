// The cities the window can show, and which one a visitor starts with. No three.js here,
// so entry.js can use this before the 3D code loads.
import ZONE_TABLE from './zones.js';

// Each city has its own skyline file, loaded only when shown. A city joins the list (the
// City buttons and the timezone match) once its skyline is drawn.
const ALL = {
  'san-francisco': { label: 'San Francisco', zone: 'America/Los_Angeles', lat: 37.77, lon: -122.42, skyline: () => import('./skylines/san-francisco.js') },
  nyc: { label: 'New York', zone: 'America/New_York', lat: 40.71, lon: -74.01, skyline: () => import('./skylines/nyc.js') },
  austin: { label: 'Austin', zone: 'America/Chicago', lat: 30.27, lon: -97.74, skyline: () => import('./skylines/austin.js') },
  toronto: { label: 'Toronto', zone: 'America/Toronto', lat: 43.65, lon: -79.38, skyline: () => import('./skylines/toronto.js') },
  london: { label: 'London', zone: 'Europe/London', lat: 51.51, lon: -0.13, skyline: () => import('./skylines/london.js') },
  paris: { label: 'Paris', zone: 'Europe/Paris', lat: 48.86, lon: 2.35, skyline: () => import('./skylines/paris.js') },
  stockholm: { label: 'Stockholm', zone: 'Europe/Stockholm', lat: 59.33, lon: 18.07, skyline: () => import('./skylines/stockholm.js') },
  seoul: { label: 'Seoul', zone: 'Asia/Seoul', lat: 37.57, lon: 126.98, skyline: () => import('./skylines/seoul.js') },
  tokyo: { label: 'Tokyo', zone: 'Asia/Tokyo', lat: 35.68, lon: 139.69, skyline: () => import('./skylines/tokyo.js') },
  shanghai: { label: 'Shanghai', zone: 'Asia/Shanghai', lat: 31.23, lon: 121.47, skyline: () => import('./skylines/shanghai.js') },
  singapore: { label: 'Singapore', zone: 'Asia/Singapore', lat: 1.29, lon: 103.85, skyline: () => import('./skylines/singapore.js') },
};
export const CITIES = Object.fromEntries(Object.entries(ALL).filter(([, city]) => city.skyline));
export const DEFAULT_CITY = 'san-francisco';

// Older names some browsers still report, mapped to the ones in zone.tab.
const ALIASES = {
  'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'Atlantic/Faeroe': 'Atlantic/Faroe', 'America/Montreal': 'America/Toronto', 'Asia/Chongqing': 'Asia/Shanghai',
};

let zones = null; // name -> [lat, lon], parsed on first use
const zoneAt = (name) => {
  zones ??= Object.fromEntries(ZONE_TABLE.split('\n').map((line) => {
    const [zone, lat, lon] = line.split(' ');
    return [zone, [Number(lat), Number(lon)]];
  }));
  return zones[ALIASES[name] ?? name];
};

// Minutes ahead of UTC in zone at now, daylight saving included.
export function offsetAt(zone, now = new Date()) {
  const t = Math.floor(now.getTime() / 60000) * 60000;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(t).map(({ type, value }) => [type, Number(value)]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t) / 60000;
}

const rad = Math.PI / 180;
const distance = ([lat0, lon0], [lat1, lon1]) => Math.acos(Math.min(1,
  Math.sin(lat0 * rad) * Math.sin(lat1 * rad) + Math.cos(lat0 * rad) * Math.cos(lat1 * rad) * Math.cos((lon1 - lon0) * rad)));

// The city for a timezone: its own city if it has one, otherwise the cities whose clocks
// are closest right now, and of those the nearest to the zone's reference point.
export function cityForZone(zone, now = new Date()) {
  const own = Object.keys(CITIES).find((key) => CITIES[key].zone === zone);
  if (own) return own;
  let offset;
  try {
    offset = offsetAt(zone, now);
  } catch {
    return DEFAULT_CITY; // a name this browser doesn't know
  }
  const gaps = Object.entries(CITIES).map(([key, city]) => [key, Math.abs(offsetAt(city.zone, now) - offset)]);
  const smallest = Math.min(...gaps.map(([, gap]) => gap));
  const closest = gaps.filter(([, gap]) => gap === smallest).map(([key]) => key);
  const place = zoneAt(zone);
  if (closest.length === 1 || !place) return closest.includes(DEFAULT_CITY) ? DEFAULT_CITY : closest[0];
  return closest.reduce((best, key) => (distance(place, [CITIES[key].lat, CITIES[key].lon]) < distance(place, [CITIES[best].lat, CITIES[best].lon]) ? key : best));
}

// ?city=<key> picks a city; otherwise it comes from the browser's timezone (no prompt, no lookup).
export function initialCity() {
  const requested = new URLSearchParams(location.search).get('city');
  if (CITIES[requested]) return requested;
  return cityForZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}
