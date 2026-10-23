// Editable brand + media configuration.
// Nothing here is invented history: only the positioning supplied in the brief.
export const brand = {
  positioning: 'Contemporary luxury boutique with an Indian soul and a futuristic digital identity.',
  promise: 'Discover a world where timeless craftsmanship meets extraordinary expression.',
  personality: ['Ethereal', 'Elegant', 'Mysterious', 'Artistic', 'Confident', 'Luxurious'],
};

// Drop real photography into client/public/images/ and reference it here.
// While an entry is null the site renders deterministic generative placeholders.
export const media = {
  heroPlates: [null, null, null], // e.g. '/images/hero-1.jpg'
  details: [],                    // real texture / embroidery close-ups; the "World of Details" section appears only when filled
};

// Instagram strip. Fill in your real account; posts are images YOU own (drop files in client/public/images/).
// Until `url` is set the section is hidden in production builds (visible in dev with placeholders).
export const social = {
  instagram: {
    handle: null,   // e.g. 'dhanya.studio'
    url: null,      // e.g. 'https://www.instagram.com/dhanya.studio'
    posts: [],      // [{ image: '/images/ig-1.jpg', href: 'https://www.instagram.com/reel/...', alt: 'Describe the image' }]
  },
};

// Physical studio / boutique. Fill in real details; the "Visit us" section is hidden in production until `address` is set.
export const store = {
  name: 'DHANYA Studio',
  address: null,            // e.g. ['No. 1, First Main Road', 'Bengaluru 560001']
  phone: null,              // e.g. '+91 98765 43210'
  timeZone: 'Asia/Kolkata',
  hours: null,              // e.g. { label: 'Mon – Sun · 10AM – 8PM', open: '10:00', close: '20:00', days: [0, 1, 2, 3, 4, 5, 6] }
};
