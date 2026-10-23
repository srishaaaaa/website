# DHANYA — React + R3F + GSAP + Express + PostgreSQL

## Run
1. `cp .env.example .env` and set `JWT_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, Razorpay **test** keys.
   - `DATABASE_URL` set → managed Postgres (Neon/Supabase). Empty → embedded PGlite (real Postgres, stored in `server/data`).
   - `DB_SCHEMA=dhanya` keeps DHANYA in its own schema when sharing a database with something else.
2. `npm run install:all && npm run seed && npm run dev` → site http://localhost:5173, API :4000
3. `npm test` runs the backend integration suite (in-memory Postgres, no network, no real payments).
4. Staff: sign in at /login with ADMIN_EMAIL/ADMIN_PASSWORD → /admin.

Migrations in `server/db/migrations` apply automatically at startup (`npm run migrate` to run them alone). Seed is idempotent.

## Phase 2 — immersive frontend
Portal intro, 3D hero, scroll choreography, mega-menu, live search, catalog, PDP gallery, quick view, page transitions, cursor, a11y/reduced-motion. Homepage also has **Customer reviews**, **Instagram** and **Visit us** sections.

## Phase 3 — backend foundation
- PostgreSQL schema (profiles, categories, collections, products, variants, images, carts, wishlists, addresses, orders, payments, inventory movements, discounts, shipping methods, reviews, newsletter, audit events). Money = integer paise.
- Server-side catalog: filters, sort, pagination, facets, collections, live search suggestions.
- httpOnly cookie sessions + CSRF header, role-based admin APIs (role re-read from DB), rate limits, zod validation.
- Server-persisted cart (guest cookie → merged into the account cart on sign-in), server-priced and stock-capped; wishlist synced for signed-in users.
- Checkout builds the order from the server cart; stock is reserved atomically (no overselling) and released on failure/expiry; payments marked paid only after signature verification (pluggable provider interface; Razorpay implemented).
- Reviews: verified-purchase only, moderated in /admin.

## Homepage redesign (latest)
- **ImmersiveHero**: pearl-ivory hero with an architectural grid, oversized DHANYA lettering behind the subject, and the seated-woman photograph kept exactly as shot. Depth comes from CSS-perspective layers (atmospheric glow plane, two gold keyline planes, ambient shadow, sheen, foreground details) driven by a smoothed pointer (touch devices get a slow ambient drift; reduced motion is static). GSAP ScrollTrigger drives the scroll composition (lettering drifts, grid gains perspective, mask reveal into the featured collection).
- **FloatingNavbar**, **FeaturedCollections**, **ProductCard3D** (tilt, image transition, add to bag / choose size, wishlist, quick view, stock), **CustomerReviews** (approved, verified-purchase only, paginated), **StoreLocationMap**, **InstagramStrip**, **LuxuryFooter** (plum, soft fade).
- Boutique address, hours, phone/email, Instagram and social links are **store settings** edited in /admin (API: `PUT /api/admin/settings/store`, `PUT /api/admin/settings/social`, and `PUT /api/admin/pages/:slug` for policies). With no address configured the location section shows a placeholder, never an invented pin. Set `GOOGLE_MAPS_API_KEY` (Maps Embed API, referrer-restricted) to use the keyed embed; without it a keyless Google embed is used.

## Latest changes
- Homepage restyled to one warm cream palette with a heavy grotesque display face (Archivo) and italic serif quotes (Newsreader); the seated-woman photograph is a soft-edged cut-out in front of the oversized DHANYA lettering.
- Sample catalogue (53 pieces: sarees by fabric, bridal silk, trending, lehengas, salwar suits, kurtas, dresses, co-ords, couple combos, blouses, dupattas) with a Fabric filter. **All names, prices and stock are placeholders.**
- Clearly-labelled **sample reviews** (flagged in the database, shown as "Sample review", switch off in /admin → Store settings).
- Boutique location pinned from the owner Google Maps link (Dhanyas Boutique, Kumbakonam). Street address, PIN, phone and hours are not set yet — add them in /admin.
- Redesigned About page (live counts, categories, how it works, features row, map).

## Content you must supply
- **Photography:** products have no images yet; generated plates stand in. Set product images and `client/src/config/content.js` (`media`).
- **Boutique location, hours, social links, policies:** enter them in /admin → Store settings (policy text via the API until the Phase 5 editor).
- **Brand story / journal copy.**

## Not yet built
Full checkout redesign, discounts, email, password reset, address book UI, admin product/inventory/content screens (Phase 4–5), Next.js/TypeScript migration, optional sound, 3D product models, policy/FAQ/contact pages, e2e tests.
Before production: set `NODE_ENV=production`, a 32+ char `JWT_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, review CSP, rotate any credential that was shared in chat.
