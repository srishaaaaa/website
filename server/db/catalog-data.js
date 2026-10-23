// SAMPLE catalogue data (placeholders). Names, prices and stock are invented so the storefront can be built and
// tested end to end; replace with the boutique's real inventory and photography in /admin.
// Sample GST rates: 5% up to Rs 2,500, 18% above (verify with your accountant before going live).

export const CATEGORIES = [
  ['Sarees', 'sarees'], ['Lehengas', 'lehengas'], ['Salwar Suits', 'salwar-suits'], ['Kurtas', 'kurtas'], ['Dresses', 'dresses'],
  ['Co-ords', 'co-ords'], ['Couple Combos', 'couple-combos'], ['Festive', 'festive'], ['Blouses', 'blouses'], ['Dupattas', 'dupattas'],
];

export const SIZE_SETS = {
  FREE: ['Free Size'],
  WEAR: ['S', 'M', 'L', 'XL'],
  DRESS: ['XS', 'S', 'M', 'L', 'XL'],
  COUPLE: ['Her S · His M', 'Her M · His L', 'Her L · His XL'],
  BLOUSE: ['32', '34', '36', '38', '40'],
};

// The original nine pieces (kept exactly as first seeded). [slug, name, category, price(paise), gst%, featured, colors, stockBySize, material]
export const CORE = [
  ['banarasi-silk-saree', 'Banarasi Silk Saree', 'sarees', 1850000, 5, true, ['Default'], { S: 10, M: 10, L: 10 }, 'Banarasi silk'],
  ['midnight-kurta-set', 'Midnight Kurta Set', 'kurtas', 680000, 5, true, ['Midnight', 'Ivory'], { S: 8, M: 8, L: 0 }, 'Cotton silk'],
  ['champagne-co-ord', 'Champagne Co-ord Set', 'co-ords', 540000, 5, true, ['Default'], { S: 10, M: 10, L: 10 }, 'Crepe'],
  ['rose-organza-dress', 'Rose Organza Dress', 'dresses', 920000, 12, false, ['Default'], { S: 6, M: 6, L: 6 }, 'Organza'],
  ['plum-festive-lehenga', 'Plum Festive Lehenga', 'festive', 3200000, 12, true, ['Default'], { S: 4, M: 4, L: 4 }, 'Velvet'],
  ['ivory-chanderi-saree', 'Ivory Chanderi Saree', 'sarees', 1280000, 5, false, ['Default'], { S: 5, M: 5, L: 5 }, 'Chanderi silk'],
  ['onyx-anarkali-kurta', 'Onyx Anarkali Kurta', 'kurtas', 890000, 5, false, ['Default'], { S: 0, M: 0, L: 0 }, 'Georgette'],
  ['gold-thread-co-ord', 'Gold Thread Co-ord', 'co-ords', 760000, 5, false, ['Default'], { S: 7, M: 7, L: 7 }, 'Silk blend'],
  ['dusk-silk-dress', 'Dusk Silk Dress', 'dresses', 1150000, 12, true, ['Default'], { S: 3, M: 3, L: 3 }, 'Silk'],
];

// More pieces. [slug, name, category, priceRupees, material, colors, sizeSet, flags]
// flags: F featured · T trending · B bridal · X sold out
export const MORE = [
  // --- sarees: silk, bridal, trending, cotton & handloom, designer ---
  ['kanjivaram-bridal-saree-crimson', 'Kanjivaram Bridal Silk Saree · Crimson', 'sarees', 58000, 'Kanjivaram silk', ['Crimson'], 'FREE', 'FB'],
  ['kanjivaram-bridal-saree-emerald', 'Kanjivaram Bridal Silk Saree · Emerald', 'sarees', 64000, 'Kanjivaram silk', ['Emerald'], 'FREE', 'B'],
  ['banarasi-bridal-brocade-saree-gold', 'Banarasi Bridal Brocade Saree · Gold', 'sarees', 42000, 'Banarasi silk', ['Gold'], 'FREE', 'FB'],
  ['tussar-silk-saree-saffron', 'Tussar Silk Saree · Saffron', 'sarees', 9800, 'Tussar silk', ['Saffron'], 'FREE', ''],
  ['mysore-silk-saree-wine', 'Mysore Silk Saree · Wine', 'sarees', 14500, 'Mysore silk', ['Wine'], 'FREE', 'B'],
  ['uppada-silk-saree-peacock', 'Uppada Silk Saree · Peacock', 'sarees', 11200, 'Uppada silk', ['Peacock'], 'FREE', 'T'],
  ['organza-saree-blush', 'Organza Saree · Blush', 'sarees', 6400, 'Organza', ['Blush', 'Mint'], 'FREE', 'FT'],
  ['satin-georgette-saree-sage', 'Satin Georgette Saree · Sage', 'sarees', 4800, 'Georgette', ['Sage'], 'FREE', 'T'],
  ['ruffle-net-saree-beige', 'Ruffle Net Saree · Beige', 'sarees', 7900, 'Net', ['Beige'], 'FREE', 'T'],
  ['sequin-shimmer-saree-midnight', 'Sequin Shimmer Saree · Midnight', 'sarees', 8600, 'Georgette', ['Midnight'], 'FREE', 'T'],
  ['linen-saree-sand', 'Linen Saree · Sand', 'sarees', 3900, 'Linen', ['Sand', 'Olive'], 'FREE', 'T'],
  ['cotton-handloom-saree-indigo', 'Cotton Handloom Saree · Indigo', 'sarees', 2900, 'Cotton', ['Indigo'], 'FREE', ''],
  ['bandhani-georgette-saree-coral', 'Bandhani Georgette Saree · Coral', 'sarees', 5200, 'Georgette', ['Coral'], 'FREE', 'T'],
  ['kota-doria-saree-lilac', 'Kota Doria Saree · Lilac', 'sarees', 3600, 'Kota cotton', ['Lilac'], 'FREE', ''],
  // --- lehengas ---
  ['bridal-lehenga-ruby-zardozi', 'Bridal Lehenga · Ruby Zardozi', 'lehengas', 89000, 'Raw silk', ['Ruby'], 'WEAR', 'FB'],
  ['pastel-organza-lehenga-mint', 'Pastel Organza Lehenga · Mint', 'lehengas', 36000, 'Organza', ['Mint'], 'WEAR', 'F'],
  ['velvet-lehenga-wine', 'Velvet Lehenga · Wine', 'lehengas', 48000, 'Velvet', ['Wine'], 'WEAR', 'B'],
  ['banarasi-lehenga-gold', 'Banarasi Lehenga · Gold', 'lehengas', 54000, 'Banarasi silk', ['Gold'], 'WEAR', 'B'],
  ['mirror-work-lehenga-indigo', 'Mirror Work Lehenga · Indigo', 'lehengas', 28000, 'Cotton silk', ['Indigo'], 'WEAR', 'X'],
  ['floral-printed-lehenga-peach', 'Floral Printed Lehenga · Peach', 'lehengas', 18500, 'Georgette', ['Peach'], 'WEAR', ''],
  // --- salwar suits ---
  ['anarkali-salwar-suit-teal', 'Anarkali Salwar Suit · Teal', 'salwar-suits', 6800, 'Georgette', ['Teal'], 'WEAR', 'F'],
  ['straight-salwar-suit-rose', 'Straight Salwar Suit · Rose', 'salwar-suits', 3900, 'Cotton', ['Rose'], 'WEAR', ''],
  ['palazzo-salwar-set-ivory', 'Palazzo Salwar Set · Ivory', 'salwar-suits', 4200, 'Chanderi silk', ['Ivory'], 'WEAR', ''],
  ['patiala-salwar-suit-fuchsia', 'Patiala Salwar Suit · Fuchsia', 'salwar-suits', 4600, 'Cotton silk', ['Fuchsia'], 'WEAR', ''],
  ['sharara-suit-mustard', 'Sharara Suit · Mustard', 'salwar-suits', 7900, 'Georgette', ['Mustard'], 'WEAR', 'F'],
  ['churidar-suit-navy', 'Churidar Suit · Navy', 'salwar-suits', 3600, 'Cotton', ['Navy'], 'WEAR', ''],
  // --- kurtas ---
  ['chikankari-kurta-white', 'Chikankari Kurta · White', 'kurtas', 3400, 'Cotton', ['White'], 'WEAR', ''],
  ['cotton-straight-kurta-indigo', 'Cotton Straight Kurta · Indigo', 'kurtas', 1900, 'Cotton', ['Indigo'], 'WEAR', ''],
  ['silk-blend-kurta-set-maroon', 'Silk Blend Kurta Set · Maroon', 'kurtas', 5600, 'Silk blend', ['Maroon'], 'WEAR', ''],
  // --- dresses, co-ords ---
  ['satin-evening-gown-wine', 'Satin Evening Gown · Wine', 'dresses', 9800, 'Satin', ['Wine'], 'DRESS', ''],
  ['floral-maxi-dress', 'Floral Maxi Dress', 'dresses', 4200, 'Georgette', ['Blue floral'], 'DRESS', ''],
  ['ethnic-fusion-dress-mustard', 'Ethnic Fusion Dress · Mustard', 'dresses', 3800, 'Cotton', ['Mustard'], 'DRESS', ''],
  ['linen-co-ord-sage', 'Linen Co-ord · Sage', 'co-ords', 4600, 'Linen', ['Sage'], 'WEAR', ''],
  ['printed-cotton-co-ord-peach', 'Printed Cotton Co-ord · Peach', 'co-ords', 3200, 'Cotton', ['Peach'], 'WEAR', ''],
  // --- couple combos (her + his sets) ---
  ['couple-combo-ivory-gold', 'Couple Combo · Ivory & Gold', 'couple-combos', 12500, 'Silk blend', ['Ivory & Gold'], 'COUPLE', 'F'],
  ['couple-combo-wine-silk', 'Couple Combo · Wine Silk', 'couple-combos', 16800, 'Silk', ['Wine'], 'COUPLE', 'F'],
  ['couple-combo-teal-festive', 'Couple Combo · Teal Festive', 'couple-combos', 14200, 'Cotton silk', ['Teal'], 'COUPLE', ''],
  ['couple-combo-pastel-wedding', 'Couple Combo · Pastel Wedding Guest', 'couple-combos', 18900, 'Organza & linen', ['Pastel'], 'COUPLE', ''],
  ['couple-combo-midnight-reception', 'Couple Combo · Midnight Reception', 'couple-combos', 22000, 'Velvet', ['Midnight'], 'COUPLE', ''],
  // --- blouses, dupattas ---
  ['readymade-silk-blouse-gold', 'Readymade Silk Blouse · Gold', 'blouses', 2400, 'Silk', ['Gold'], 'BLOUSE', ''],
  ['embroidered-blouse-wine', 'Embroidered Blouse · Wine', 'blouses', 3200, 'Velvet', ['Wine'], 'BLOUSE', ''],
  ['back-knot-designer-blouse-ivory', 'Designer Back-Knot Blouse · Ivory', 'blouses', 2800, 'Silk', ['Ivory'], 'BLOUSE', ''],
  ['banarasi-dupatta-rose', 'Banarasi Dupatta · Rose', 'dupattas', 2200, 'Banarasi silk', ['Rose'], 'FREE', ''],
  ['organza-dupatta-ivory', 'Organza Dupatta · Ivory', 'dupattas', 3000, 'Organza', ['Ivory'], 'FREE', ''],
];

// Collections: [slug, name, description, order, productSlugs]. Flag-driven lists are built in the seed.
export const COLLECTIONS_BY_FLAG = [
  ['trending-sarees', 'Trending Sarees', 'The sarees everyone is asking about this season.', 3, 'T'],
  ['bridal-silk-sarees', 'Bridal Silk Sarees', 'Kanjivaram, Banarasi and Mysore silks for the bride.', 4, 'B'],
];

export const DEMO_REVIEWS = [
  ['banarasi-silk-saree', 'Ananya R.', 5, 'The drape is stunning. It caught the light beautifully at the wedding.'],
  ['kanjivaram-bridal-saree-crimson', 'Lakshmi V.', 5, 'The zari work is rich and the colour is exactly as pictured. I felt like a bride all over again.'],
  ['midnight-kurta-set', 'Meera K.', 5, 'Elegant, comfortable and exactly the right shade of midnight.'],
  ['bridal-lehenga-ruby-zardozi', 'Divya P.', 5, 'Heavy work but surprisingly easy to carry. Every photo came out beautifully.'],
  ['organza-saree-blush', 'Tanvi M.', 5, 'Soft, airy and so flattering. The fabric feels truly luxurious.'],
  ['couple-combo-ivory-gold', 'Rohan & Isha S.', 5, 'We matched without looking identical. Lovely quality for both of us.'],
  ['anarkali-salwar-suit-teal', 'Kavya N.', 5, 'The flare is gorgeous and the fit was spot on.'],
  ['gold-thread-co-ord', 'Riya D.', 4, 'Beautiful detailing. Sizing runs true, so go with your usual size.'],
  ['dusk-silk-dress', 'Sana A.', 5, 'Quiet luxury. I keep getting asked where it is from.'],
  ['linen-saree-sand', 'Pooja T.', 5, 'Light enough to wear all day and it still looks polished.'],
  ['plum-festive-lehenga', 'Nisha B.', 5, 'Made every festive photo better. The plum is richer in person.'],
  ['chikankari-kurta-white', 'Aarti G.', 5, 'Crisp, fine embroidery and very comfortable for long days.'],
];
