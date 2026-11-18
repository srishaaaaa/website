# Deploying DHANYA as ONE project (Vercel)

The repository holds a Vite client (`client/`) and an Express API (`server/`). They deploy together as a single
project: the client is built to static files and the API runs as one serverless function (`api/index.js`).
`vercel.json` already routes `/api/*` to the function and every other path to the single-page app.

## Import
1. In Vercel choose **Add New → Project** and import the repository.
2. If Vercel says *“Multiple applications detected”*, **do not** import `client` and `server` separately.
   Keep **Root Directory = `./`** and set the **Framework Preset to “Other”**. `vercel.json` then builds both.
3. Add the environment variables below (Production), then deploy.

## Environment variables
| Name | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Postgres URL (Neon/Supabase). Required in production. |
| `DB_SCHEMA` | Optional, e.g. `dhanya` to keep DHANYA in its own schema of a shared database. |
| `JWT_SECRET` | 32+ random characters. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay keys (test keys first). Webhook URL: `https://<your-domain>/api/payments/webhook` |
| `GOOGLE_MAPS_API_KEY` | Optional Maps Embed key (restrict it by HTTP referrer). |
| `PG_POOL_MAX` | `3` is plenty per serverless instance. |
| `RESERVATION_MINUTES` | Optional, default 30. |

`CLIENT_ORIGIN` is not needed: the site and API share one origin, so cookies work without CORS.

## First-time database setup (run once from your machine)
```
set DATABASE_URL=<production url>    # PowerShell: $env:DATABASE_URL="..."
set DB_SCHEMA=dhanya                 # if you use a schema
npm run migrate --prefix server
npm run seed --prefix server         # optional: sample catalogue + sample reviews
```
Migrations are not run on every cold start in production; run `npm run migrate` after pulling new migrations.

## Notes
* Uploaded images are stored in Postgres (see Admin → Products & images), so there is no disk to persist.
  Vercel limits a request body to ~4.5 MB; the admin uploader shrinks photos before sending.
* The admin owner account is created by the seed from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (set them only for that step).
