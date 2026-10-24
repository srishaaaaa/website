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
  // --- more samples so every category has a full shelf ---
  ['paithani-silk-saree-magenta', 'Paithani Silk Saree · Magenta', 'sarees', 26000, 'Paithani silk', ['Magenta'], 'FREE', 'FB'],
  ['pochampally-ikat-saree-rust', 'Pochampally Ikat Saree · Rust', 'sarees', 7400, 'Ikat cotton silk', ['Rust'], 'FREE', 'T'],
  ['chiffon-printed-saree-aqua', 'Chiffon Printed Saree · Aqua', 'sarees', 3100, 'Chiffon', ['Aqua'], 'FREE', ''],
  ['sharara-lehenga-dusty-rose', 'Sharara Lehenga · Dusty Rose', 'lehengas', 32000, 'Georgette', ['Dusty rose'], 'WEAR', 'F'],
  ['half-saree-lehenga-parrot', 'Half-Saree Lehenga · Parrot Green', 'lehengas', 21500, 'Kanjivaram silk', ['Parrot green'], 'WEAR', 'B'],
  ['cotton-salwar-suit-lemon', 'Cotton Salwar Suit · Lemon', 'salwar-suits', 2900, 'Cotton', ['Lemon'], 'WEAR', ''],
  ['festive-anarkali-set-burgundy', 'Festive Anarkali Set · Burgundy', 'salwar-suits', 8400, 'Silk blend', ['Burgundy'], 'WEAR', 'F'],
  ['bandhej-kurta-set-green', 'Bandhej Kurta Set · Green', 'kurtas', 3600, 'Cotton', ['Green'], 'WEAR', ''],
  ['angrakha-kurta-ivory', 'Angrakha Kurta · Ivory', 'kurtas', 2800, 'Cotton silk', ['Ivory'], 'WEAR', ''],
  ['long-slit-kurta-black', 'Long Slit Kurta · Black', 'kurtas', 2400, 'Rayon', ['Black'], 'WEAR', ''],
  ['wrap-midi-dress-terracotta', 'Wrap Midi Dress · Terracotta', 'dresses', 4400, 'Crepe', ['Terracotta'], 'DRESS', ''],
  ['tiered-ethnic-dress-teal', 'Tiered Ethnic Dress · Teal', 'dresses', 5200, 'Georgette', ['Teal'], 'DRESS', ''],
  ['embroidered-co-ord-ivory', 'Embroidered Co-ord · Ivory', 'co-ords', 5400, 'Cotton silk', ['Ivory'], 'WEAR', ''],
  ['satin-co-ord-wine', 'Satin Co-ord · Wine', 'co-ords', 4900, 'Satin', ['Wine'], 'WEAR', ''],
  ['couple-combo-red-gold-wedding', 'Couple Combo · Red & Gold Wedding', 'couple-combos', 24500, 'Silk', ['Red & Gold'], 'COUPLE', ''],
  ['couple-combo-sage-linen', 'Couple Combo · Sage Linen', 'couple-combos', 11800, 'Linen', ['Sage'], 'COUPLE', ''],
  ['diwali-festive-lehenga-saffron', 'Diwali Festive Lehenga · Saffron', 'festive', 27500, 'Silk blend', ['Saffron'], 'WEAR', 'F'],
  ['festive-silk-saree-royal-blue', 'Festive Silk Saree · Royal Blue', 'festive', 12800, 'Silk', ['Royal blue'], 'FREE', 'T'],
  ['festive-sharara-set-gold', 'Festive Sharara Set · Gold', 'festive', 9600, 'Georgette', ['Gold'], 'WEAR', ''],
  ['festive-kurta-set-plum', 'Festive Kurta Set · Plum', 'festive', 6200, 'Silk blend', ['Plum'], 'WEAR', ''],
  ['festive-gown-emerald', 'Festive Gown · Emerald', 'festive', 14800, 'Velvet', ['Emerald'], 'DRESS', ''],
  ['zari-border-blouse-maroon', 'Zari Border Blouse · Maroon', 'blouses', 2600, 'Silk', ['Maroon'], 'BLOUSE', ''],
  ['boat-neck-blouse-black', 'Boat-Neck Blouse · Black', 'blouses', 1800, 'Cotton', ['Black'], 'BLOUSE', ''],
  ['bridal-hand-embroidered-blouse', 'Bridal Hand-Embroidered Blouse', 'blouses', 5800, 'Raw silk', ['Antique gold'], 'BLOUSE', 'B'],
  ['bandhani-dupatta-red', 'Bandhani Dupatta · Red', 'dupattas', 1900, 'Georgette', ['Red'], 'FREE', ''],
  ['phulkari-dupatta-fuchsia', 'Phulkari Dupatta · Fuchsia', 'dupattas', 2400, 'Cotton', ['Fuchsia'], 'FREE', ''],
  ['net-sequin-dupatta-champagne', 'Net Sequin Dupatta · Champagne', 'dupattas', 2700, 'Net', ['Champagne'], 'FREE', ''],
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
  // Saree-focused samples (all flagged and labelled as samples; delete from Admin → Sample data)
  ['kanjivaram-bridal-saree-emerald', 'Shruthi M.', 5, 'The emerald and gold combination is breathtaking. It held its fall beautifully through the whole ceremony.'],
  ['banarasi-bridal-brocade-saree-gold', 'Revathi K.', 5, 'Heavy brocade that still drapes softly. My mother kept touching the border all evening.'],
  ['tussar-silk-saree-saffron', 'Deepa S.', 4, 'Lovely natural texture and a rich saffron. I would wash it gently and keep it for special days.'],
  ['mysore-silk-saree-wine', 'Gayathri R.', 5, 'Smooth, light and the wine shade is deep and elegant. Perfect for a family function.'],
  ['uppada-silk-saree-peacock', 'Harini V.', 5, 'The peacock colour glows in daylight. Very easy to pleat and carry all day.'],
  ['organza-saree-blush', 'Nandhini P.', 5, 'Feather light and so pretty in photographs. The blush tone suits every skin tone.'],
  ['satin-georgette-saree-sage', 'Swathi L.', 4, 'A modern colour with a lovely flow. It slips a little at first, so a good pin helps.'],
  ['linen-saree-sand', 'Anitha B.', 5, 'Breathable and elegant for a hot day. It looks crisp even after hours of wear.'],
  ['cotton-handloom-saree-indigo', 'Vimala D.', 5, 'Soft after the first wash and the indigo is deep. My everyday favourite now.'],
  ['bandhani-georgette-saree-coral', 'Jaya T.', 5, 'The bandhani work is neat and the coral is cheerful. Many compliments at the festival.'],
  ['ivory-chanderi-saree', 'Mythili A.', 5, 'Classic ivory with a delicate sheen. Exactly what I wanted for an afternoon wedding.'],
  ['sequin-shimmer-saree-midnight', 'Pavithra N.', 4, 'A showstopper for evening events. The sequins are secure and it is lighter than it looks.'],
];
