// Shared JWT verification for edge functions
// SD-LEO-FIX-EDGE-FUNCTION-JWT-001

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function verifyJwt(request: Request): Promise<{ user: any; error: string | null }> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, error: 'Missing authorization header' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authClient = createClient(supabaseUrl, supabaseAnonKey);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await authClient.auth.getUser(token);

  if (error || !user) {
    return { user: null, error: error?.message || 'Invalid token' };
  }

  return { user, error: null };
}
