// Each city is its own file, so a visitor only downloads their skyline.
export const CITIES = {
  nyc: { label: 'New York', load: () => import('./nyc.js') },
  'san-francisco': { label: 'San Francisco', load: () => import('./san-francisco.js') },
  london: { label: 'London', load: () => import('./london.js') },
  chicago: { label: 'Chicago', load: () => import('./chicago.js') },
};

const EASTERN = /^America\/(New_York|Detroit|Toronto|Montreal|Nassau|Kentucky\/.+|Indiana\/(?!Knox|Tell_City).+)$|^US\/(Eastern|Michigan)$/;
const CENTRAL = /^America\/(Chicago|Winnipeg|Menominee|Indiana\/(Knox|Tell_City)|North_Dakota\/.+)$|^US\/Central$/;
// Everyone outside US Eastern, US Central and Europe gets San Francisco.
export function cityForTimezone(zone = '') {
  if (EASTERN.test(zone)) return 'nyc';
  if (CENTRAL.test(zone)) return 'chicago';
  if (zone.startsWith('Europe/') || zone === 'Atlantic/Reykjavik') return 'london';
  return 'san-francisco';
}
