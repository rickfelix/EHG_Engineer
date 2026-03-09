// Service Tasks Claim Edge Function
// Venture Factory: Atomically claims a pending task with optimistic locking
// SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-B

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { task_id, claimed_by } = body;

    if (!task_id) {
      return new Response(
        JSON.stringify({ error: 'task_id is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Create authenticated client (RLS enforces venture isolation)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Optimistic locking: conditional UPDATE where status = 'pending'
    // If another agent claimed it first, this returns 0 rows
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('service_tasks')
      .update({
        status: 'claimed',
        claimed_at: now,
        metadata: { claimed_by: claimed_by ?? 'unknown', claimed_at: now },
        updated_at: now,
      })
      .eq('id', task_id)
      .eq('status', 'pending')  // Optimistic lock: only claim if still pending
      .select('id, venture_id, service_id, task_type, status, priority, input_params, claimed_at, metadata')
      .single();

    if (error) {
      // If no rows matched, the task was already claimed or doesn't exist
      if (error.code === 'PGRST116') {
        // Check if task exists but is already claimed
        const { data: existing } = await supabase
          .from('service_tasks')
          .select('id, status')
          .eq('id', task_id)
          .single();

        if (existing && existing.status !== 'pending') {
          return new Response(
            JSON.stringify({ error: 'Task already claimed or completed', current_status: existing.status }),
            { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ error: 'Task not found or not accessible' }),
          { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ task: data }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
