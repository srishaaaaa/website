import { useApp } from '../context/App';
import { brand } from '../config/content';

// Built-in website wording. Anything filled in under Admin → Site text replaces the matching line.
export const TEXT_DEFAULTS = {
  storyTitle: 'Shop Story', story: brand.story,
  trendingEyebrow: 'TRENDING NOW', trendingTitle: 'TRENDING COLLECTIONS', trendingSub: 'Handpicked pieces everyone is loving right now.',
  worldEyebrow: 'COLLECTIONS', worldTitle: 'CHOOSE YOUR WORLD.',
  instaTitle: 'INSIDE DHANYA BOUTIQUE', instaSub: 'Discover our boutique, explore our collections, and experience the beauty of sarees.',
  contactEyebrow: 'GET IN TOUCH', contactTitle: 'ENQUIRE WITH\nDHANYA BOUTIQUE.', contactSub: 'Looking for a particular saree? Tell us what you need and we will get back to you.',
  aboutTitle: 'AN INDIAN SOUL.\nA MODERN WARDROBE.', aboutLead: brand.positioning, aboutSub: brand.promise,
};

export function useSiteText() {
  const { site } = useApp();
  const c = site.content || {};
  const out = { ...TEXT_DEFAULTS };
  for (const k of Object.keys(TEXT_DEFAULTS)) {
    const v = c[k];
    if (Array.isArray(v) ? v.some(x => x && x.trim()) : v && String(v).trim()) out[k] = Array.isArray(v) ? v.filter(x => x && x.trim()) : v;
  }
  return out;
}
