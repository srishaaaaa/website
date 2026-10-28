// Single-project deployment: the same repository serves the Vite client (static) and this Express API
// (one serverless function). vercel.json routes /api/* here and everything else to the SPA.
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db/index.js';
import { createApp } from '../server/app.js';

let app, starting;
// Created once per warm instance. Migrations are NOT run here: run `npm run migrate` against DATABASE_URL.
// If start-up fails (for example the database was briefly unreachable), the next request tries again
// instead of this instance failing until Vercel recycles it.
const start = () => (starting ??= (async () => {
  const cfg = loadConfig();
  const db = await createDb(cfg);
  return createApp({ db, cfg });
})().catch(e => { starting = null; throw e }));

export default async function handler(req, res) {
  try { app ??= await start() } catch (e) {
    console.error('API failed to start:', e.message);
    res.statusCode = 503; res.setHeader('content-type', 'application/json'); res.setHeader('retry-after', '2');
    return res.end(JSON.stringify({ error: 'The server is starting up or cannot reach the database. Please try again in a moment.' }));
  }
  return app(req, res);
}
