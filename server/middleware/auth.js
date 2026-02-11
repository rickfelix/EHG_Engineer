/**
 * Express Authentication Middleware
 * SD-LEO-ORCH-SECURITY-AUDIT-REMEDIATION-001-C
 *
 * Express-compatible auth middleware adapted from lib/middleware/api-auth.ts.
 * Validates JWT tokens and creates authenticated Supabase clients.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Extract and verify JWT token from Authorization header.
 * Returns { user, supabase } on success, null on failure.
 */
async function verifyToken(token) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return null;
  }

  return { user, supabase };
}

/**
 * Require authentication - returns 401 if no valid JWT.
 * Attaches req.user and req.supabase on success.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const internalKey = req.headers['x-internal-api-key'];

  // Allow internal API key as alternative auth
  if (internalKey && process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) {
    req.isAdmin = true;
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
      code: 'NO_AUTH_HEADER'
    });
  }

  const token = authHeader.substring(7);
  verifyToken(token).then(result => {
    if (!result) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }
    req.user = result.user;
    req.supabase = result.supabase;
    next();
  }).catch(() => {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Token verification failed',
      code: 'TOKEN_ERROR'
    });
  });
}

/**
 * Optional authentication - continues without auth but enriches request if token present.
 * Attaches req.user and req.supabase if valid token, otherwise req.user is undefined.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const internalKey = req.headers['x-internal-api-key'];

  // Allow internal API key
  if (internalKey && process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) {
    req.isAdmin = true;
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);
  verifyToken(token).then(result => {
    if (result) {
      req.user = result.user;
      req.supabase = result.supabase;
    }
    next();
  }).catch(() => {
    // Auth failed but optional - continue without
    next();
  });
}

/**
 * Require internal API key - for server-to-server calls.
 * Validates X-Internal-API-Key header.
 */
export function requireAdminAuth(req, res, next) {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  const providedKey = req.headers['x-internal-api-key'];

  if (!internalApiKey) {
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'INTERNAL_API_KEY not configured',
      code: 'CONFIG_ERROR'
    });
  }

  if (!providedKey || providedKey !== internalApiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing internal API key',
      code: 'INVALID_API_KEY'
    });
  }

  req.isAdmin = true;
  next();
}

/**
 * Verify JWT token for WebSocket upgrade requests.
 * Returns the user object or null.
 */
export async function verifyWebSocketToken(request) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get('token') ||
    request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return null;
  }

  return verifyToken(token);
}
