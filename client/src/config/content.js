// Editable brand + media configuration.
// Nothing here is invented history: only the positioning supplied in the brief.
export const brand = {
  positioning: 'Contemporary luxury boutique with an Indian soul and a futuristic digital identity.',
  promise: 'Discover a world where timeless craftsmanship meets extraordinary expression.',
  credit: 'Cenexa Systems', // shown in the footer as "Powered by …"; change or clear to suit
  personality: ['Ethereal', 'Elegant', 'Mysterious', 'Artistic', 'Confident', 'Luxurious'],
};

// Drop real photography into client/public/images/ and reference it here.
// While an entry is null the site renders deterministic generative placeholders.
export const media = {
  heroImage: '/images/hero-saree.jpg',         // the editorial photograph at the centre of the hero
  heroCutout: '/images/hero-saree-cutout.png',         // transparent cut-out of the same photograph (soft-feathered)
  heroCutoutWebp: '/images/hero-saree-cutout.webp',
  heroAlt: 'A woman seated on a carved wooden chair in a sage-gold saree with a lace border', // describe the current hero photograph
  heroImageWide: '/images/hero-saree-wide.png', // landscape crop of the same shoot
  details: [],                                  // real texture / embroidery close-ups; the "World of Details" section appears only when filled
};
// Boutique location, opening hours and social links are managed in the admin (store settings), not here.
