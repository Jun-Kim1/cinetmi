'use strict';

const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 3000;
const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

/* ── Startup guard ── */
if (!TMDB_KEY) {
  console.error('[CineTMI] TMDB_API_KEY environment variable is not set. Exiting.');
  process.exit(1);
}

/* ── CORS (must be before all routes) ──
 * ALLOWED_ORIGINS behavior:
 * - '*'                      => allow all origins
 * - 'https://a.com,https://b.com' => allow listed origins
 * - unset                    => default allow GitHub Pages origin
 */
const defaultOrigins = ['https://jun-kim1.github.io'];
const envOriginsRaw = process.env.ALLOWED_ORIGINS;
const envOrigins = envOriginsRaw
  ? envOriginsRaw.split(',').map(s => s.trim()).filter(Boolean)
  : defaultOrigins;
const allowAllOrigins = envOrigins.includes('*');

const corsOptions = {
  origin(origin, cb) {
    /* Allow non-browser requests (curl, server-to-server) */
    if (!origin) return cb(null, true);
    if (allowAllOrigins) return cb(null, true);
    if (envOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* ── Security headers ── */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

/* ── Health check — used by the frontend to detect cold-start wake-up ── */
app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.end('ok');
});

/* ── Block direct download of server-side source files ──
 * Must be registered BEFORE express.static so these routes are matched first.
 */
app.get(['/server.js', '/package.json', '/package-lock.json', '/.env'], (_req, res) => {
  res.status(403).end('Forbidden');
});

/* ── Static files (HTML / CSS / JS)
 * Express serves the frontend files from the same directory.
 * No secrets are stored in those files — config is all env-based.
 */
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
}));

/* ── TMDB Proxy  GET /api/tmdb/<path>?<query> ──
 * The server injects TMDB_API_KEY; the client never sees or sends it.
 * Any query params from the client (language, region, query, page, …)
 * are forwarded as-is, with api_key merged in on the server side.
 */
app.get('/api/tmdb/*', async (req, res) => {
  const tmdbPath = req.params[0];
  if (!tmdbPath) {
    return res.status(400).json({ error: 'Missing TMDB path' });
  }

  /* Merge client params, then overwrite api_key with the server secret */
  const params = { ...req.query, api_key: TMDB_KEY };

  try {
    const { data } = await axios.get(`${TMDB_BASE}/${tmdbPath}`, {
      params,
      timeout: 8000,
    });
    res.json(data);
  } catch (err) {
    if (err.response) {
      console.warn('[CineTMI] TMDB error', {
        path: tmdbPath,
        status: err.response.status,
      });
      /* Forward TMDB's own status code and body */
      return res.status(err.response.status).json(err.response.data);
    }
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'TMDB request timed out' });
    }
    console.error('[CineTMI] TMDB proxy error:', err.message);
    res.status(503).json({ error: 'Failed to reach TMDB' });
  }
});

/* ── 404 handler ── */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`[CineTMI] Server running on port ${PORT}`);
});
