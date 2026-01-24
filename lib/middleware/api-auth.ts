/**
 * API Authentication Middleware
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001
 *
 * SECURITY: Verifies JWT tokens for API routes
 * - Validates Authorization header (Bearer token)
 * - Creates authenticated Supabase client with user context
 * - Enforces RLS by NOT using service_role key for user operations
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

export interface AuthenticatedRequest extends NextApiRequest {
  user: User;
  supabase: SupabaseClient;
}

export type AuthenticatedHandler = (
  req: AuthenticatedRequest,
  res: NextApiResponse
) => Promise<void> | void;

/**
 * Wrap an API handler with authentication
 *
 * SECURITY:
 * - Validates JWT from Authorization header
 * - Creates user-scoped Supabase client (respects RLS)
 * - Returns 401 if no valid token
 *
 * @example
 * export default withAuth(async (req, res) => {
 *   const { user, supabase } = req;
 *   // User is authenticated, RLS is enforced
 *   const { data } = await supabase.from('ventures').select('*');
 *   res.json(data);
 * });
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('SECURITY: Missing Supabase configuration');
      return res.status(500).json({
        error: 'Server configuration error',
        code: 'CONFIG_ERROR'
      });
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer <token>',
        code: 'NO_AUTH_HEADER'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Create Supabase client with user's JWT
    // SECURITY: This creates a client that respects RLS based on the user's identity
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    // Verify the token by getting the user
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.warn(`Auth failed: ${error?.message || 'No user found'}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Attach user and authenticated supabase client to request
    const authenticatedReq = req as AuthenticatedRequest;
    authenticatedReq.user = user;
    authenticatedReq.supabase = supabase;

    // Call the actual handler
    return handler(authenticatedReq, res);
  };
}

/**
 * Optional auth - allows both authenticated and unauthenticated requests
 * Useful for endpoints that show different data based on auth status
 *
 * @example
 * export default withOptionalAuth(async (req, res) => {
 *   if (req.user) {
 *     // Authenticated - show user's data
 *   } else {
 *     // Unauthenticated - show public data
 *   }
 * });
 */
export function withOptionalAuth(handler: AuthenticatedHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('SECURITY: Missing Supabase configuration');
      return res.status(500).json({
        error: 'Server configuration error',
        code: 'CONFIG_ERROR'
      });
    }

    const authHeader = req.headers.authorization;
    const authenticatedReq = req as AuthenticatedRequest;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });

      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (!error && user) {
        authenticatedReq.user = user;
        authenticatedReq.supabase = supabase;
      } else {
        // Create anonymous client
        authenticatedReq.supabase = createClient(supabaseUrl, supabaseAnonKey);
      }
    } else {
      // No auth header - create anonymous client
      authenticatedReq.supabase = createClient(supabaseUrl, supabaseAnonKey);
    }

    return handler(authenticatedReq, res);
  };
}

/**
 * Admin auth - requires service role for internal operations
 * SECURITY: Only use for internal scripts, never for user-facing endpoints
 *
 * Validates that the request has a valid internal API key
 */
export function withAdminAuth(handler: AuthenticatedHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const internalApiKey = process.env.INTERNAL_API_KEY;
    const providedKey = req.headers['x-internal-api-key'];

    if (!internalApiKey) {
      console.error('SECURITY: INTERNAL_API_KEY not configured');
      return res.status(500).json({
        error: 'Server configuration error',
        code: 'CONFIG_ERROR'
      });
    }

    if (!providedKey || providedKey !== internalApiKey) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid or missing internal API key',
        code: 'INVALID_API_KEY'
      });
    }

    // For admin routes, create service client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({
        error: 'Server configuration error',
        code: 'CONFIG_ERROR'
      });
    }

    const authenticatedReq = req as AuthenticatedRequest;
    authenticatedReq.supabase = createClient(supabaseUrl, serviceKey);

    return handler(authenticatedReq, res);
  };
}
