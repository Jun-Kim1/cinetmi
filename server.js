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

/* Render terminates HTTPS in front of Express. Trust only that first proxy so
   req.ip can be used for the small password-attempt limiter below. */
app.set('trust proxy', 1);

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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

/* ── tmi_posts write API ── */
const TMI_CATEGORIES = new Set(['오마주', '스토리', '감독', '배우', '미장센', '비하인드', '잡담']);
const PASSWORD_PREFIX = 'pbkdf2_sha256$';
const passwordAttempts = new Map();

function hashPassword(password) {
  const iterations = 120000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2_sha256$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, storedPassword) {
  if (typeof password !== 'string' || typeof storedPassword !== 'string') return false;

  /* Legacy rows stored the 4-digit PIN as plain text. Keep them usable while
     migrating each row to a hash after the first successful verification. */
  if (!storedPassword.startsWith(PASSWORD_PREFIX)) {
    return storedPassword === password;
  }

  const parts = storedPassword.split('$');
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;

  try {
    const salt = Buffer.from(parts[2], 'base64');
    const expected = Buffer.from(parts[3], 'base64');
    const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_err) {
    return false;
  }
}

function cleanPostId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validatePassword(password) {
  return typeof password === 'string' && /^\d{4}$/.test(password);
}

function normalizePostBody(body, { requireContentId = false } = {}) {
  const source = body || {};
  const nickname = String(source.nickname || '익명').trim() || '익명';
  const category = String(source.category || '');
  const content = String(source.content || '').trim();
  const imageUrl = source.image_url == null || source.image_url === '' ? null : String(source.image_url).trim();
  const contentId = Number(source.content_id);

  if (nickname.length > 40) return { error: 'nickname must be 1–40 characters' };
  if (!TMI_CATEGORIES.has(category)) return { error: 'invalid category' };
  if (!content || content.length > 500) return { error: 'content must be 1–500 characters' };
  if (imageUrl && (imageUrl.length > 2048 || !/^https:\/\//i.test(imageUrl))) {
    return { error: 'image_url must be a valid HTTPS URL' };
  }
  if (requireContentId && (!Number.isFinite(contentId) || contentId <= 0)) {
    return { error: 'content_id must be a positive number' };
  }

  return {
    value: {
      nickname,
      category,
      content,
      image_url: imageUrl,
      ...(requireContentId ? { content_id: contentId } : {}),
    },
  };
}

function passwordAttemptKey(req, postId) {
  return `${req.ip || 'unknown'}:${postId}`;
}

function isPasswordAttemptBlocked(req, postId) {
  const key = passwordAttemptKey(req, postId);
  const now = Date.now();
  const state = passwordAttempts.get(key);
  if (!state || state.resetAt <= now) {
    passwordAttempts.delete(key);
    return false;
  }
  return state.count >= 10;
}

function recordPasswordFailure(req, postId) {
  const key = passwordAttemptKey(req, postId);
  const now = Date.now();
  const state = passwordAttempts.get(key);
  if (!state || state.resetAt <= now) {
    passwordAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  state.count += 1;
}

function clearPasswordFailures(req, postId) {
  passwordAttempts.delete(passwordAttemptKey(req, postId));
}

function extractStoragePath(url) {
  if (!url) return null;
  for (const bucket of ['images', 'tmi_images']) {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.indexOf(marker);
    if (index !== -1) {
      return { bucket, path: decodeURIComponent(url.slice(index + marker.length).split('?')[0]) };
    }
  }
  return null;
}

async function removeStorageFile(url) {
  const storageInfo = extractStoragePath(url);
  if (!storageInfo) return;
  try {
    const { error } = await cineSb.storage.from(storageInfo.bucket).remove([storageInfo.path]);
    if (error) console.warn('[CineTMI] Storage cleanup failed:', error.message);
  } catch (err) {
    /* The post mutation already succeeded. Do not turn an orphaned image into
       a misleading API failure that could make the browser retry the mutation. */
    console.warn('[CineTMI] Storage cleanup failed:', err.message);
  }
}

async function getPostForPassword(postId) {
  const { data, error } = await cineSb
    .from('tmi_posts')
    .select('id, password, image_url')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function authenticatePost(req, res, postId, password) {
  if (!validatePassword(password)) {
    res.status(400).json({ message: 'password must be exactly 4 digits' });
    return null;
  }
  if (isPasswordAttemptBlocked(req, postId)) {
    res.status(429).json({ message: 'Too many password attempts. Try again later.' });
    return null;
  }

  const post = await getPostForPassword(postId);
  if (!post || !verifyPassword(password, post.password)) {
    recordPasswordFailure(req, postId);
    res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
    return null;
  }

  clearPasswordFailures(req, postId);
  if (!post.password.startsWith(PASSWORD_PREFIX)) {
    const { error } = await cineSb
      .from('tmi_posts')
      .update({ password: hashPassword(password) })
      .eq('id', postId)
      .eq('password', post.password);
    if (error) throw error;
    post.password = PASSWORD_PREFIX;
  }
  return post;
}

app.use(express.json());

app.post('/api/tmi-posts', async (req, res) => {
  if (!cineSb) {
    return res.status(500).json({ message: 'CINETMI_SUPABASE_URL / KEY env vars not set' });
  }

  const { password } = req.body || {};
  if (!validatePassword(password)) {
    return res.status(400).json({ message: 'password must be exactly 4 digits' });
  }
  const normalized = normalizePostBody(req.body, { requireContentId: true });
  if (normalized.error) return res.status(400).json({ message: normalized.error });

  try {
    const { error } = await cineSb.from('tmi_posts').insert({
      ...normalized.value,
      password: hashPassword(password),
    });
    if (error) return res.status(500).json({ message: error.message });
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[CineTMI] TMI create failed:', err.message);
    return res.status(500).json({ message: 'save failed' });
  }
});

app.post('/api/tmi-posts/:id/verify', async (req, res) => {
  if (!cineSb) return res.status(500).json({ message: 'Supabase server config is not set' });
  const postId = cleanPostId(req.params.id);
  if (!postId) return res.status(400).json({ message: 'invalid post id' });

  try {
    const post = await authenticatePost(req, res, postId, req.body?.password);
    if (!post) return;
    return res.json({ ok: true });
  } catch (err) {
    console.error('[CineTMI] TMI verify failed:', err.message);
    return res.status(500).json({ message: 'verification failed' });
  }
});

app.put('/api/tmi-posts/:id', async (req, res) => {
  if (!cineSb) return res.status(500).json({ message: 'Supabase server config is not set' });
  const postId = cleanPostId(req.params.id);
  if (!postId) return res.status(400).json({ message: 'invalid post id' });
  const normalized = normalizePostBody(req.body);
  if (normalized.error) return res.status(400).json({ message: normalized.error });

  try {
    const post = await authenticatePost(req, res, postId, req.body?.password);
    if (!post) return;

    const { error } = await cineSb.from('tmi_posts').update(normalized.value).eq('id', postId);
    if (error) return res.status(500).json({ message: error.message });
    if (post.image_url && post.image_url !== normalized.value.image_url) {
      await removeStorageFile(post.image_url);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[CineTMI] TMI update failed:', err.message);
    return res.status(500).json({ message: 'update failed' });
  }
});

app.delete('/api/tmi-posts/:id', async (req, res) => {
  if (!cineSb) return res.status(500).json({ message: 'Supabase server config is not set' });
  const postId = cleanPostId(req.params.id);
  if (!postId) return res.status(400).json({ message: 'invalid post id' });

  try {
    const post = await authenticatePost(req, res, postId, req.body?.password);
    if (!post) return;

    const { error } = await cineSb.from('tmi_posts').delete().eq('id', postId);
    if (error) return res.status(500).json({ message: error.message });
    if (post.image_url) await removeStorageFile(post.image_url);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[CineTMI] TMI delete failed:', err.message);
    return res.status(500).json({ message: 'delete failed' });
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
