// Editable brand + media configuration.
// Nothing here is invented history: only the positioning supplied in the brief.
export const brand = {
  positioning: 'Contemporary luxury boutique with an Indian soul and a futuristic digital identity.',
  promise: 'Discover a world where timeless craftsmanship meets extraordinary expression.',
  credit: 'Cenexa Systems', // shown in the footer as "Powered by …"; change or clear to suit
  // Our Story copy: brand voice only (values, categories). Replace with the boutique's own words when ready.
  story: [
    'At DHANYA, fashion is more than clothing. It is a quiet celebration of elegance, tradition and modern femininity: contemporary luxury with an Indian soul.',
    "Our collection brings timeless craftsmanship together with a contemporary eye: sarees in every fabric, bridal silks, lehengas, salwar suits, kurtas, couple combos and everyday ladies' wear, for festivals, weddings and every occasion in between.",
    'We believe every woman deserves to feel beautiful, confident and effortlessly herself. That is why we design for comfort, luxury and grace together, while honouring the authenticity of Indian ethnic fashion.',
  ],
  personality: ['Ethereal', 'Elegant', 'Mysterious', 'Artistic', 'Confident', 'Luxurious'],
};

// Drop real photography into client/public/images/ and reference it here.
// While an entry is null the site renders deterministic generative placeholders.
export const media = {
  heroCutout: '/images/hero-cutout.png',   // transparent cut-out of the hero model (soft-feathered edges)
  heroDepth: '/images/hero-depth.png',        // estimated depth map of the cut-out (drives the 3D mesh)
  heroCutoutWebp: '/images/hero-cutout.webp',
  heroAlt: 'A woman in a peach-pink striped saree and a gold blouse, mid-turn as her pallu flies out behind her',
  storyImage: '/images/story.jpg',
  storyAlt: 'A woman in a red silk saree with gold buttis, her pallu lifting behind her as she turns',
  details: [],                                  // real texture / embroidery close-ups; the "World of Details" section appears only when filled
};
// Boutique location, opening hours and social links are managed in the admin (store settings), not here.
