'use strict';

const express    = require('express');
const cors       = require('cors');
const axios      = require('axios');
const path       = require('path');
const crypto     = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app      = express();
const PORT     = process.env.PORT || 3000;
const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

const CINETMI_SUPABASE_URL              = process.env.CINETMI_SUPABASE_URL;
const CINETMI_SUPABASE_SERVICE_ROLE_KEY = process.env.CINETMI_SUPABASE_SERVICE_ROLE_KEY;

const cineSb = (CINETMI_SUPABASE_URL && CINETMI_SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(CINETMI_SUPABASE_URL, CINETMI_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

/* ── Startup guard ── */
if (!TMDB_KEY) {
  console.error('[CineTMI] TMDB_API_KEY environment variable is not set. Exiting.');
  process.exit(1);
}

/* ── CORS (must be before all routes) ──
 * ALLOWED_ORIGINS behavior:
 * - '*'                      => allow all origins
 * - 'https://a.com,https://b.com' => allow listed origins
 * - unset                    => default allow InFilm + GitHub Pages origins
 */
const defaultOrigins = ['https://infilm.onrender.com', 'https://jun-kim1.github.io'];
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
  methods: ['GET', 'POST', 'OPTIONS'],
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
  if (!tmdbPath) return res.status(400).json({ error: 'Missing TMDB path' });

  // 1. 인기순(popularity.desc)으로 기준을 아예 고정합니다.
  // 2. append_to_response 등을 위해 쿼리를 병합합니다.
  const params = { 
    sort_by: 'popularity.desc', 
    ...req.query, 
    api_key: TMDB_KEY 
  };

  try {
    const { data } = await axios.get(`${TMDB_BASE}/${tmdbPath}`, { params, timeout: 8000 });
    
    // 캐시 설정 (실시간 반영을 위해 0으로 두되, 순서 보장을 위해 정렬은 index.js에서 수행)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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

/* ── tmi_posts save  POST /api/tmi-posts ── */
function hashPassword(password) {
  const iterations = 120000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2_sha256$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

app.use(express.json());

app.post('/api/tmi-posts', async (req, res) => {
  if (!cineSb) {
    return res.status(500).json({ message: 'CINETMI_SUPABASE_URL / KEY env vars not set' });
  }

  const { nickname, password, category, content, content_id } = req.body || {};
  const allowedCategories = new Set(['오마주', '스토리', '감독', '배우', '미장센', '비하인드', '잡담']);

  if (!nickname || !category || !content || !content_id) {
    return res.status(400).json({ message: 'nickname, category, content, content_id are required' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'password must be at least 8 characters' });
  }
  if (!allowedCategories.has(String(category))) {
    return res.status(400).json({ message: 'invalid category' });
  }

  const cleanNickname  = String(nickname).trim();
  const cleanContent   = String(content).trim();
  const cleanContentId = Number(content_id);

  if (!cleanNickname || cleanNickname.length > 40) {
    return res.status(400).json({ message: 'nickname must be 1–40 characters' });
  }
  if (!cleanContent || cleanContent.length < 4 || cleanContent.length > 500) {
    return res.status(400).json({ message: 'content must be 4–500 characters' });
  }
  if (!Number.isFinite(cleanContentId) || cleanContentId <= 0) {
    return res.status(400).json({ message: 'content_id must be a positive number' });
  }

  try {
    const { error } = await cineSb.from('tmi_posts').insert({
      nickname:   cleanNickname,
      password:   hashPassword(password),
      category,
      content:    cleanContent,
      content_id: cleanContentId,
    });
    if (error) return res.status(500).json({ message: error.message });
    return res.status(201).json({ ok: true });
  } catch (_err) {
    return res.status(500).json({ message: 'save failed' });
  }
});

/* ── 404 handler ── */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`[CineTMI] Server running on port ${PORT}`);
  console.log('Allowed Origins:', process.env.ALLOWED_ORIGINS);
  console.log('CINETMI_SUPABASE_URL set:', Boolean(CINETMI_SUPABASE_URL));
});
