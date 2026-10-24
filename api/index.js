// Single-project deployment: the same repository serves the Vite client (static) and this Express API
// (one serverless function). vercel.json routes /api/* here and everything else to the SPA.
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db/index.js';
import { createApp } from '../server/app.js';

let app;
// Created once per warm instance. Migrations are NOT run here: run `npm run migrate` against DATABASE_URL.
const ready = (async () => {
  const cfg = loadConfig();
  const db = await createDb(cfg);
  return createApp({ db, cfg });
})();

export default async function handler(req, res) {
  try { app ??= await ready } catch (e) {
    console.error('API failed to start:', e.message);
    res.statusCode = 500; res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'Server is not configured. Check the environment variables.' }));
  }
  return app(req, res);
}
