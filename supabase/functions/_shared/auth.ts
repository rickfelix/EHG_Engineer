// Shared authentication and CORS utilities for Supabase Edge Functions
// SD: SD-LEO-FIX-EDGE-FUNCTION-JWT-001
// Centralizes JWT verification and CORS origin checking to avoid duplication.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Allowed origins for CORS, loaded from ALLOWED_ORIGINS env var.
 * Falls back to 'http://localhost:8080' if not set.
 */
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:8080').split(',').filter(Boolean)

/**
 * Returns CORS headers with origin checking.
 * If the request Origin is in the allowed list, it is reflected back.
 * Otherwise, the first allowed origin is used (restrictive default).
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

/**
 * Verifies the JWT token from the Authorization header.
 * Uses the anon key client to call auth.getUser() which validates the token
 * server-side against Supabase Auth.
 *
 * Returns the authenticated user on success, or an error with HTTP status on failure.
 */
export async function verifyJWT(
  req: Request
): Promise<{ user: any; error?: string; status?: number }> {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      user: null,
      error: 'Missing or invalid Authorization header',
      status: 401,
    }
  }

  const token = authHeader.replace('Bearer ', '')

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  )

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)

  if (authError || !user) {
    return {
      user: null,
      error: 'Invalid or expired token',
      status: 401,
    }
  }

  return { user }
}

/**
 * Creates a Supabase admin client using the service role key.
 * This client bypasses RLS and should only be used after JWT verification.
 */
export function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
}
