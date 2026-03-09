// Service Tasks Complete Edge Function
// Venture Factory: Marks a claimed task as completed or failed
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
    const { task_id, action } = body;

    if (!task_id) {
      return new Response(
        JSON.stringify({ error: 'task_id is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!action || (action !== 'complete' && action !== 'fail')) {
      return new Response(
        JSON.stringify({ error: 'action must be "complete" or "fail"' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Create authenticated client (RLS enforces venture isolation)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const now = new Date().toISOString();

    if (action === 'complete') {
      const { result, confidence_score } = body;

      // Validate confidence_score
      if (confidence_score !== undefined && confidence_score !== null) {
        const score = Number(confidence_score);
        if (isNaN(score) || score < 0 || score > 1) {
          return new Response(
            JSON.stringify({ error: 'confidence_score must be between 0 and 1' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Only complete tasks that are currently claimed
      const { data, error } = await supabase
        .from('service_tasks')
        .update({
          status: 'completed',
          artifacts: result ?? null,
          confidence_score: confidence_score ?? null,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', task_id)
        .eq('status', 'claimed')  // Only complete claimed tasks
        .select('id, venture_id, service_id, task_type, status, artifacts, confidence_score, completed_at')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return new Response(
            JSON.stringify({ error: 'Task not found, not claimed, or not accessible' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
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
    }

    if (action === 'fail') {
      const { error_message } = body;

      if (!error_message) {
        return new Response(
          JSON.stringify({ error: 'error_message is required for fail action' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Only fail tasks that are currently claimed
      const { data, error } = await supabase
        .from('service_tasks')
        .update({
          status: 'failed',
          error_message: error_message,
          updated_at: now,
        })
        .eq('id', task_id)
        .eq('status', 'claimed')  // Only fail claimed tasks
        .select('id, venture_id, service_id, task_type, status, error_message')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return new Response(
            JSON.stringify({ error: 'Task not found, not claimed, or not accessible' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
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
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
