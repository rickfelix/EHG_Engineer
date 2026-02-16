/**
 * API Authentication Middleware
 *
 * JWT-based authentication for Express routes. Validates tokens
 * from Supabase Auth and attaches user context to requests.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-J
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
      if (apiKey && apiKey === SERVICE_ROLE_KEY) {
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

      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role || 'user',
        isChairman: user.user_metadata?.role === 'chairman',
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
    const { data, error } = await supabase.rpc('fn_is_chairman', {
      user_uuid: userId,
    });

    if (error) {
      // Function may not exist yet — fall back to metadata check
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      return userData?.user?.user_metadata?.role === 'chairman';
    }

    return data === true;
  } catch {
    return false;
  }
}
