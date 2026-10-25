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

## Latest (design pass + admin images)
- Hero: rounded editorial panel; the model is a real 3D mesh (cut-out displaced by an AI-estimated depth map, lit by relief shading, turns gently with the pointer). Lookbook (tabbed, real queries), 3D coverflow of collections, wine-panel Our Story, softer image boxes, refined shop menu type.
- **Admin → Products & images / Storefront images**: upload product photos (drag-drop, reorder, alt text, remove), category and collection covers, the hero model, the Our Story photo and Instagram photos. Images are stored in Postgres (`media_files`) and served from `/api/media/:id`.
- **One-project deploy**: see DEPLOY.md (vercel.json + api/index.js).
- tools/make-cutout.py makes a soft-edged transparent cut-out from any model photo.

## Reels, map, Our Story (latest)
- Homepage has a reel strip (up to 6 vertical MP4/WebM clips or photos; autoplay muted on screen, tap to unmute). Add them in Admin → Storefront images → Reels & photos (upload under 4 MB each, or paste a direct https .mp4 link). Videos stream with HTTP Range support.
- Visit-us map shows the boutique pin and address (AGM Apartment, 26, Kasthooribhai Road, Srinivas Nagar, Sakkottai, Kumbakonam 612001). Phone and opening hours are not set: add them in Admin → Orders & settings → Store settings.

## DHANYA BOUTIQUE redesign (latest)
- Beige x red identity, Playfair Display serif + Archivo, layered hero (ivory panel, overlapping model photo, textile inset, "For you" panel), looping ticker, tabbed saree catalogue with search, editorial band, retail/wholesale enquiries + contact, three reel slots, Shop Story, live map, footer.
- **Photos you add** (Admin → Storefront images): hero model (transparent PNG best), textile close-up, editorial photo, Our Story photo, category/collection covers, reels. Until added, those frames stay blank by design.
- **Enquiries** are stored in the database (Admin → Enquiries) and can be answered by phone/WhatsApp. WhatsApp links are built from the phone number in Store settings.
- **Sample data**: demo products, reviews and enquiries are flagged `sample`. Delete them one by one (Products & images, Review moderation, Enquiries) or all at once at Admin → Sample data. Real data is never touched.
  - `npm run seed` re-creates the sample data (it is idempotent, so run it only on a fresh database). To create only the owner account and the structure, with no demo data, run `npm run seed -- --admin-only` from inside the `server` folder.
- Business details used: owner Ananthi M, Dhanyas Boutique, phone 80980 89591, email dhanyasboutique2015@gmail.com, Instagram @ananthinathan84 (edit any time in Admin → Store settings).

## Content you must supply
- **Photography:** products have no images yet; generated plates stand in. Set product images and `client/src/config/content.js` (`media`).
- **Boutique location, hours, social links, policies:** enter them in /admin → Store settings (policy text via the API until the Phase 5 editor).
- **Brand story / journal copy.**

## Not yet built
Full checkout redesign, discounts, email, password reset, address book UI, admin product/inventory/content screens (Phase 4–5), Next.js/TypeScript migration, optional sound, 3D product models, policy/FAQ/contact pages, e2e tests.
Before production: set `NODE_ENV=production`, a 32+ char `JWT_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, review CSP, rotate any credential that was shared in chat.

## Stitching Studio (admin only)
Made-to-measure workflow inside the existing admin (sidebar group **Stitching Studio**). The public site is untouched: only `AdminShell` (sidebar entry), `App.jsx` (admin routes) and `app.js` (one API mount) were edited; everything else is new (`server/lib/stitching.js`, `server/routes/stitching.js`, migration `016_stitching.sql`, `client/src/pages/stitching/*`, `client/src/stitching.css`).

- **Routes**: `/admin/stitching` (dashboard), `/orders`, `/orders/new`, `/orders/:id`, `/measurements`, `/appointments`, `/designs`, `/tailors`, `/reports`, `/garments` (garment types), and `/admin/stitching/print/:id?copy=job|customer` (job card / customer receipt).
- **Permissions** (enforced in the API, role re-read from the database): owner/admin do everything. Cashiers create orders, take payments, edit measurements, update status, add alterations, book appointments. Only owner/admin: reports, tailor/design/garment-type setup, reassigning a tailor, changing charges/discounts, cancelling, refunds, QC and balance overrides. Inventory role and customers get 403. Measurements are never served by a public endpoint.
- **Workflow**: 12 stages with controlled transitions (stages may be skipped; every change records who, when, note). Production status, payment status and delivery are separate: payment never changes status and delivery never changes payment. Cutting needs measurements; *Ready* needs the quality checklist to pass (owner/admin override is recorded); *Delivered* needs a zero balance (owner/admin override recorded). Alterations are rounds (never overwritten); a new round starts a fresh QC checklist.
- **Measurements**: per-customer profiles by garment group (blouse, kurti, bottom, skirt, gown, custom), inches or cm, validated, versioned with full history (who/when). Each order stores a dated snapshot, so later profile edits never change old orders.
- **Money**: server-computed with the POS bill maths (integer paise, GST optional). Payments live in a ledger (`stitch_payments`) with idempotency keys; order creation and payments are safe against double submit. **Create invoice** bills the order once through the existing POS `createSale` (same totals, payments split by method as recorded), so nothing is billed or counted twice; charges lock after invoicing. Stitching reports use the stitching tables only (order value vs money collected vs outstanding; unpaid orders are never "collected").
- **Fabric link**: a boutique fabric product can be linked to an item for reference. **Stock is not deducted** by stitching: sell the fabric through Billing so stock and invoice stay correct.
- **Appointments**: calendar and list, overlap warnings (per customer and per tailor), reschedule/cancel/complete. Reminders are a manual WhatsApp link you press yourself: the system sends nothing.
- **Not included (by design)**: attendance/HR, automatic messaging, per-garment progress (progress is per order), refunds through a payment gateway (refunds are ledger entries; a refund is blocked once invoiced: void the invoice in Billing).
- Tests: `npm test` in `server` (includes `stitching.test.js`: access control, totals, duplicates, workflow rules, alterations, QC, payments, POS invoice, reports).
