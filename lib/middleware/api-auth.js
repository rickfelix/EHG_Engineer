/**
 * API Authentication Middleware
 *
 * JWT-based authentication for Express routes. Validates tokens
 * from Supabase Auth and attaches user context to requests.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-J
 */

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Timing-safe string comparison to prevent timing attacks on API keys.
 * SD-LEO-FIX-API-ROUTE-AUTH-001
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Routes that don't require authentication
const PUBLIC_ROUTES = new Set([
  '/api/health',
  '/api/status',
  '/api/version',
]);

/**
 * Create JWT authentication middleware.
 *
 * @param {Object} options
 * @param {Set<string>} [options.publicRoutes] - Additional public routes
 * @param {boolean} [options.allowServiceRole] - Allow service role key in x-api-key header
 * @returns {Function} Express middleware
 */
export function createAuthMiddleware(options = {}) {
  const publicRoutes = new Set([...PUBLIC_ROUTES, ...(options.publicRoutes || [])]);
  const allowServiceRole = options.allowServiceRole ?? true;

  return async function authMiddleware(req, res, next) {
    // Skip auth for public routes
    if (publicRoutes.has(req.path)) {
      return next();
    }

    // Check for service role API key
    if (allowServiceRole) {
      const apiKey = req.headers['x-api-key'];
      if (apiKey && SERVICE_ROLE_KEY && safeCompare(apiKey, SERVICE_ROLE_KEY)) {
        req.user = { role: 'service_role', isServiceRole: true };
        return next();
      }
    }

    // Extract JWT from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header',
        code: 'AUTH_MISSING',
      });
    }

    const token = authHeader.slice(7);

    try {
      // Verify token using Supabase
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
          code: 'AUTH_INVALID',
        });
      }

      // Attach user to request.
      // SECURITY (SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001):
      // role MUST come from app_metadata, not user_metadata. user_metadata is the
      // half the account holder can rewrite at will via auth.updateUser({ data }),
      // so deriving privilege from it lets any authenticated principal self-promote.
      // app_metadata is service-role-writable only. Same idiom as rbac.ts:76.
      req.user = {
        id: user.id,
        email: user.email,
        role: user.app_metadata?.role || 'user',
        isChairman: user.app_metadata?.role === 'chairman',
        isServiceRole: false,
      };

      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'Authentication error',
        code: 'AUTH_ERROR',
      });
    }
  };
}

/**
 * Middleware to require chairman role.
 * Must be used after createAuthMiddleware.
 */
export function requireChairman(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }

  if (!req.user.isChairman && !req.user.isServiceRole) {
    return res.status(403).json({
      success: false,
      error: 'Chairman role required',
      code: 'FORBIDDEN_NOT_CHAIRMAN',
    });
  }

  next();
}

/**
 * Check if a user has chairman role via database function.
 *
 * @param {Object} supabase - Supabase client with service role
 * @param {string} userId - User UUID
 * @returns {Promise<boolean>}
 */
export async function isChairman(supabase, userId) {
  if (!userId) return false;

  try {
    // SECURITY (SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001):
    // this read is app_metadata, never user_metadata. It previously read the
    // client-writable half, and because it sat 57 lines below the other two
    // derivation points and inside a differently-named export, it is exactly what
    // a fix scoped to the reported lines would have left behind.
    //
    // The rpc('fn_is_chairman', { user_uuid }) call that used to guard this path
    // was removed rather than repaired: the live function has exactly ONE
    // signature and it is ZERO-ARG (it resolves the caller via auth.uid()), so
    // that call returned PGRST202 on every single invocation and this branch was
    // never a fallback -- it was the only path. It also could not be fixed by
    // dropping the argument, because this helper is handed an explicit userId
    // together with a service-role client, a context in which auth.uid() is NULL
    // and the zero-arg function cannot answer for that user at all.
    const { data: userData, error } = await supabase.auth.admin.getUserById(userId);
    if (error) return false;
    return userData?.user?.app_metadata?.role === 'chairman';
  } catch {
    return false;
  }
}
