import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3001', 10);
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mardkilahpajcucjkvjs.supabase.co';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const COOKIE_NAME = 'belmond_admin_token';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

// 1. Privileged Supabase Key Selection (Strict: NO fallback to anon key)
const privilegedKey = (process.env.SUPABASE_SECRET_KEY || '').trim() || (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!privilegedKey) {
  console.error('❌ Server startup error: No privileged Supabase server key configured.');
  console.error('   Please set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in your .env file.');
  console.error('   Privileged operations must not fall back to an anonymous/publishable key.');
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  console.error('❌ Server startup error: ADMIN_PASSWORD is not set in .env.');
  process.exit(1);
}

if (!SESSION_SECRET) {
  console.error('❌ Server startup error: SESSION_SECRET is not set in .env.');
  process.exit(1);
}

// Initialize privileged Supabase client without session persistence
const supabase = createClient(SUPABASE_URL, privilegedKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const app = express();

// Trust reverse proxy (e.g. Vercel / Nginx / Cloudflare) for secure cookies
app.set('trust proxy', 1);

// Security Headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
      connectSrc: ["'self'"]
    }
  }
}));

// Body Parsers with strict size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '0'
}));

// Rate limiter for login attempts: max 20 requests per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Multer in-memory storage for multi-file uploads (max 25MB per file, up to 20 files)
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
    files: 20
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();

    if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(mime)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type for "${file.originalname}". Only JPG, PNG, and WEBP formats are accepted.`));
    }
  }
});

// ==========================================
// Session Store (Hashed in Memory + HMAC Cookie)
// ==========================================

// Map of tokenHash -> { expiresAt }
const activeSessions = new Map();

// Periodic cleanup of expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [hash, session] of activeSessions.entries()) {
    if (session.expiresAt <= now) {
      activeSessions.delete(hash);
    }
  }
}, 30 * 60 * 1000);

function createSession() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('hex');
  const cookieValue = `${rawToken}.${signature}`;

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = Date.now() + SESSION_DURATION_MS;

  activeSessions.set(tokenHash, { expiresAt });

  return { cookieValue, expiresAt };
}

function verifySession(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return false;

  const parts = cookieValue.split('.');
  if (parts.length !== 2) return false;

  const [rawToken, signature] = parts;
  if (!rawToken || !signature) return false;

  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('hex');

  // Constant-time signature comparison
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  // Verify against session store
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const session = activeSessions.get(tokenHash);
  if (!session) return false;

  if (session.expiresAt <= Date.now()) {
    activeSessions.delete(tokenHash);
    return false;
  }

  return true;
}

function destroySession(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return;
  const parts = cookieValue.split('.');
  if (parts.length === 2) {
    const tokenHash = crypto.createHash('sha256').update(parts[0]).digest('hex');
    activeSessions.delete(tokenHash);
  }
}

// Constant-time password verification
function verifyPassword(inputPassword) {
  if (!inputPassword || typeof inputPassword !== 'string') return false;
  const inputBuf = Buffer.from(inputPassword);
  const targetBuf = Buffer.from(ADMIN_PASSWORD);
  if (inputBuf.length !== targetBuf.length) return false;
  return crypto.timingSafeEqual(inputBuf, targetBuf);
}

// Authentication Middleware
function requireAuth(req, res, next) {
  const cookieValue = req.cookies[COOKIE_NAME];
  if (!cookieValue || !verifySession(cookieValue)) {
    return res.status(401).json({ error: 'Unauthorized: Admin session required' });
  }
  return next();
}

// Reliable helper to extract object path from Supabase public URL
// Handles .../storage/v1/object/public/dress-images/<path> with proper URL decoding
function extractStoragePath(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  try {
    const url = new URL(imageUrl);
    const marker = '/storage/v1/object/public/dress-images/';
    const idx = url.pathname.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(url.pathname.substring(idx + marker.length));
    }
    const altMarker = '/dress-images/';
    const altIdx = url.pathname.indexOf(altMarker);
    if (altIdx !== -1) {
      return decodeURIComponent(url.pathname.substring(altIdx + altMarker.length));
    }
    const parts = url.pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1]);
  } catch (e) {
    const parts = imageUrl.split('/');
    return decodeURIComponent(parts[parts.length - 1].split('?')[0]);
  }
}

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

// POST /api/auth/login
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(401).json({ error: 'Incorrect admin password' });
  }

  if (!verifyPassword(password)) {
    return res.status(401).json({ error: 'Incorrect admin password' });
  }

  const { cookieValue } = createSession();
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS,
    path: '/'
  });

  return res.json({ success: true, message: 'Logged in successfully' });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const cookieValue = req.cookies[COOKIE_NAME];
  destroySession(cookieValue);

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });

  return res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  const cookieValue = req.cookies[COOKIE_NAME];
  if (!cookieValue || !verifySession(cookieValue)) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true });
});

// ==========================================
// 2. DASHBOARD & STATS ENDPOINTS (PROTECTED)
// ==========================================

// GET /api/stats
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const { data: dresses, error } = await supabase
      .from('dresses')
      .select('id, image_url, created_at, display_order, is_visible')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching stats:', error);
      return res.status(500).json({ error: error.message });
    }

    const all = dresses || [];
    const total = all.length;
    const published = all.filter(d => d.is_visible).length;
    const hidden = total - published;
    const recentUploads = all.slice(0, 6);

    return res.json({
      total,
      published,
      hidden,
      recentUploads,
      recent: recentUploads
    });
  } catch (err) {
    console.error('Stats endpoint error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard statistics' });
  }
});

// ==========================================
// 3. DRESSES CRUD ENDPOINTS (PROTECTED)
// ==========================================

// GET /api/dresses
app.get('/api/dresses', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dresses')
      .select('id, image_url, created_at, display_order, is_visible')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching dresses:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ dresses: data || [] });
  } catch (err) {
    console.error('Dresses endpoint error:', err);
    return res.status(500).json({ error: 'Failed to load dress collection' });
  }
});

// POST /api/dresses/upload
app.post('/api/dresses/upload', requireAuth, (req, res) => {
  upload.array('images', 20)(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size limit exceeded. Max 25MB per image.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    try {
      // Find current max display_order
      const { data: orderData } = await supabase
        .from('dresses')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1);

      let nextDisplayOrder = 1;
      if (orderData && orderData.length > 0 && typeof orderData[0].display_order === 'number') {
        nextDisplayOrder = orderData[0].display_order + 1;
      }

      const uploadedDresses = [];
      const uploadErrors = [];

      for (const file of files) {
        let uniqueFileName = null;
        try {
          const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
          uniqueFileName = `dress_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${extension}`;

          // 1. Upload to Supabase Storage bucket 'dress-images' with upsert: false
          const { error: storageError } = await supabase.storage
            .from('dress-images')
            .upload(uniqueFileName, file.buffer, {
              contentType: file.mimetype,
              cacheControl: '3600',
              upsert: false
            });

          if (storageError) {
            console.error(`Storage upload error for ${file.originalname}:`, storageError);
            uploadErrors.push({
              file: file.originalname,
              error: storageError.message || 'Storage upload failed'
            });
            continue;
          }

          // 2. Obtain public URL
          const { data: urlData } = supabase.storage
            .from('dress-images')
            .getPublicUrl(uniqueFileName);

          const publicImageUrl = urlData.publicUrl;

          // 3. Insert record into public.dresses
          const { data: dbData, error: dbError } = await supabase
            .from('dresses')
            .insert({
              image_url: publicImageUrl,
              is_visible: true,
              display_order: nextDisplayOrder++,
              created_at: new Date().toISOString()
            })
            .select('id, image_url, created_at, display_order, is_visible')
            .single();

          if (dbError) {
            console.error(`Database insert error for ${file.originalname}:`, dbError);
            // Roll back uploaded storage object to avoid leaving orphaned files
            await supabase.storage.from('dress-images').remove([uniqueFileName]);

            let errMsg = dbError.message || 'Database insert failed';
            if (dbError.code === '55000' || errMsg.includes('replica identity')) {
              errMsg = 'Table "public.dresses" is missing a Primary Key. Please run: ALTER TABLE public.dresses ADD PRIMARY KEY (id); in Supabase SQL Editor.';
            }

            uploadErrors.push({
              file: file.originalname,
              error: errMsg
            });
            continue;
          }

          uploadedDresses.push(dbData);
        } catch (itemErr) {
          console.error(`Processing error for ${file.originalname}:`, itemErr);
          if (uniqueFileName) {
            await supabase.storage.from('dress-images').remove([uniqueFileName]).catch(() => {});
          }
          uploadErrors.push({
            file: file.originalname,
            error: itemErr.message || 'Unexpected processing failure'
          });
        }
      }

      return res.json({
        success: uploadedDresses.length > 0,
        uploadedCount: uploadedDresses.length,
        failedCount: uploadErrors.length,
        uploaded: uploadedDresses,
        errors: uploadErrors
      });
    } catch (batchErr) {
      console.error('Batch upload error:', batchErr);
      return res.status(500).json({ error: 'Batch upload processing failed' });
    }
  });
});

// PATCH /api/dresses/:id/visibility
app.patch('/api/dresses/:id/visibility', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { is_visible } = req.body;

  if (typeof is_visible !== 'boolean') {
    return res.status(400).json({ error: 'Field "is_visible" must be a boolean' });
  }

  try {
    const { data, error } = await supabase
      .from('dresses')
      .update({ is_visible })
      .eq('id', id)
      .select('id, image_url, created_at, display_order, is_visible')
      .single();

    if (error) {
      console.error('Visibility toggle error:', error);
      let msg = error.message;
      if (error.code === '55000' || msg.includes('replica identity')) {
        msg = 'Table "public.dresses" is missing a Primary Key. Please run this in your Supabase SQL Editor: ALTER TABLE public.dresses ADD PRIMARY KEY (id);';
      }
      return res.status(500).json({ error: msg });
    }

    return res.json({
      success: true,
      dress: data
    });
  } catch (err) {
    console.error('Visibility update error:', err);
    return res.status(500).json({ error: 'Failed to update visibility status' });
  }
});

// DELETE /api/dresses/:id
app.delete('/api/dresses/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Fetch current dress record to get image_url
    const { data: dress, error: fetchError } = await supabase
      .from('dresses')
      .select('id, image_url')
      .eq('id', id)
      .single();

    if (fetchError || !dress) {
      return res.status(404).json({ error: 'Dress record not found' });
    }

    const storagePath = extractStoragePath(dress.image_url);

    // 2. Delete Storage object first
    let storageDeleted = false;
    let storageErrorMessage = null;

    if (storagePath) {
      const { error: storageDeleteError } = await supabase.storage
        .from('dress-images')
        .remove([storagePath]);

      if (storageDeleteError) {
        console.error('Storage deletion warning:', storageDeleteError);
        storageErrorMessage = storageDeleteError.message;
      } else {
        storageDeleted = true;
      }
    }

    // 3. Delete database record
    const { error: dbDeleteError } = await supabase
      .from('dresses')
      .delete()
      .eq('id', id);

    if (dbDeleteError) {
      console.error('Database delete error:', dbDeleteError);
      let msg = dbDeleteError.message;
      if (dbDeleteError.code === '55000' || msg.includes('replica identity')) {
        msg = 'Table "public.dresses" is missing a Primary Key. Please run this in your Supabase SQL Editor: ALTER TABLE public.dresses ADD PRIMARY KEY (id);';
      }
      return res.status(500).json({
        error: `Database delete failed: ${msg}`,
        storageDeleted
      });
    }

    return res.json({
      success: true,
      deletedId: id,
      databaseDeleted: true,
      storageDeleted,
      storageWarning: storageErrorMessage ? `Storage file deletion reported: ${storageErrorMessage}` : null
    });
  } catch (err) {
    console.error('Delete dress endpoint error:', err);
    return res.status(500).json({ error: 'Failed to delete dress record' });
  }
});

// Catch-all: serve index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`✨ Belmond Fabrics Admin Panel running at http://localhost:${PORT}`);
  console.log(`🔒 Admin authentication active on port ${PORT}`);
  console.log(`🌐 Supabase Target: ${SUPABASE_URL}`);
  console.log(`🔑 Privileged Mode: Server secret loaded (RLS bypassed)`);
});
