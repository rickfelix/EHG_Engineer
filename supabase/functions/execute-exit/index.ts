// Exit Execution Engine Edge Function
// SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-H (FR-005)
// Orchestrates 30-day separation in 4 rounds:
//   Round 1: Dependency inventory freeze
//   Round 2: Data export
//   Round 3: DNS/integration cutover validation
//   Round 4: Final certification
// Chairman approval gate between rounds.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { verifyJwt } from '../_shared/auth.ts';

const MIN_SEPARABILITY_SCORE = 60;
const ROUNDS = ['dependency_freeze', 'data_export', 'cutover_validation', 'certification'] as const;
type Round = typeof ROUNDS[number];

interface ExitState {
  venture_id: string;
  current_round: number;
  round_name: Round;
  status: string;
  started_at: string;
  rounds_completed: Round[];
}

serve(async (req: Request) => {
  const corsPreFlight = handleCorsPreFlight(req);
  if (corsPreFlight) return corsPreFlight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { user, error: authError } = await verifyJwt(req);
    if (authError) {
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = await req.json().catch(() => ({}));
    const { venture_id, action, confirm } = body;

    if (!venture_id) {
      return new Response(
        JSON.stringify({ error: 'venture_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: start, advance, abort, status
    if (action === 'status' || !action) {
      return await getExitStatus(supabase, venture_id, corsHeaders);
    }

    if (action === 'start') {
      return await startExit(supabase, venture_id, confirm, corsHeaders);
    }

    if (action === 'advance') {
      return await advanceRound(supabase, venture_id, body.chairman_approval, corsHeaders);
    }

    if (action === 'abort') {
      return await abortExit(supabase, venture_id, corsHeaders);
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: start, advance, abort, status' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getExitStatus(supabase: ReturnType<typeof createClient>, ventureId: string, corsHeaders: Record<string, string>) {
  const { data } = await supabase
    .from('venture_exit_readiness')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return new Response(
    JSON.stringify({ exit_state: data ?? null }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function startExit(supabase: ReturnType<typeof createClient>, ventureId: string, confirm: boolean, corsHeaders: Record<string, string>) {
  if (!confirm) {
    return new Response(
      JSON.stringify({ error: 'Exit requires explicit confirmation. Set confirm: true' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate separability score
  const { data: sep } = await supabase
    .from('venture_separability_scores')
    .select('overall_score')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const score = sep?.overall_score ?? 0;
  if (score < MIN_SEPARABILITY_SCORE) {
    return new Response(
      JSON.stringify({
        error: `Separability score ${score} is below minimum ${MIN_SEPARABILITY_SCORE}`,
        current_score: score,
        required_score: MIN_SEPARABILITY_SCORE,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create exit record
  const exitState = {
    venture_id: ventureId,
    current_round: 1,
    round_name: ROUNDS[0],
    status: 'in_progress',
    started_at: new Date().toISOString(),
    rounds_completed: [],
    governance_metadata: { approvals: [] },
  };

  const { error } = await supabase
    .from('venture_exit_readiness')
    .upsert(exitState, { onConflict: 'venture_id' });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Emit event
  await supabase.from('eva_event_bus').insert({
    event_type: 'exit_started',
    payload: { venture_id: ventureId, separability_score: score, round: 'dependency_freeze' },
    source: 'execute-exit',
    priority: 'high',
  });

  return new Response(
    JSON.stringify({
      message: 'Exit process started',
      venture_id: ventureId,
      current_round: 1,
      round_name: 'dependency_freeze',
      separability_score: score,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function advanceRound(supabase: ReturnType<typeof createClient>, ventureId: string, chairmanApproval: boolean, corsHeaders: Record<string, string>) {
  const { data: state } = await supabase
    .from('venture_exit_readiness')
    .select('*')
    .eq('venture_id', ventureId)
    .single();

  if (!state || state.status !== 'in_progress') {
    return new Response(
      JSON.stringify({ error: 'No active exit process for this venture' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!chairmanApproval) {
    return new Response(
      JSON.stringify({
        error: 'Chairman approval required to advance rounds',
        current_round: state.current_round,
        round_name: ROUNDS[state.current_round - 1],
      }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const completedRounds = state.rounds_completed ?? [];
  completedRounds.push(ROUNDS[state.current_round - 1]);

  const nextRound = state.current_round + 1;

  if (nextRound > ROUNDS.length) {
    // Exit complete — generate certification
    const certId = crypto.randomUUID();

    await supabase.from('venture_data_room_artifacts').insert({
      id: certId,
      venture_id: ventureId,
      artifact_type: 'exit_certification',
      title: 'Exit Certification',
      content: {
        venture_id: ventureId,
        rounds_completed: completedRounds,
        certified_at: new Date().toISOString(),
        separability_verified: true,
      },
    });

    await supabase
      .from('venture_exit_readiness')
      .update({
        status: 'completed',
        rounds_completed: completedRounds,
        current_round: 4,
        round_name: 'certification',
      })
      .eq('venture_id', ventureId);

    await supabase.from('eva_event_bus').insert({
      event_type: 'exit_completed',
      payload: { venture_id: ventureId, certification_id: certId },
      source: 'execute-exit',
      priority: 'high',
    });

    return new Response(
      JSON.stringify({
        message: 'Exit process completed. Certification generated.',
        venture_id: ventureId,
        certification_id: certId,
        rounds_completed: completedRounds,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Advance to next round
  await supabase
    .from('venture_exit_readiness')
    .update({
      current_round: nextRound,
      round_name: ROUNDS[nextRound - 1],
      rounds_completed: completedRounds,
      governance_metadata: {
        ...(state.governance_metadata ?? {}),
        approvals: [
          ...((state.governance_metadata?.approvals) ?? []),
          { round: state.current_round, approved_at: new Date().toISOString() },
        ],
      },
    })
    .eq('venture_id', ventureId);

  return new Response(
    JSON.stringify({
      message: `Advanced to round ${nextRound}: ${ROUNDS[nextRound - 1]}`,
      venture_id: ventureId,
      current_round: nextRound,
      round_name: ROUNDS[nextRound - 1],
      rounds_completed: completedRounds,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function abortExit(supabase: ReturnType<typeof createClient>, ventureId: string, corsHeaders: Record<string, string>) {
  const { data: state } = await supabase
    .from('venture_exit_readiness')
    .select('current_round, status')
    .eq('venture_id', ventureId)
    .single();

  if (!state || state.status !== 'in_progress') {
    return new Response(
      JSON.stringify({ error: 'No active exit process to abort' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (state.current_round > 2) {
    return new Response(
      JSON.stringify({
        error: 'Cannot abort after round 2. Rounds 3-4 are irreversible.',
        current_round: state.current_round,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  await supabase
    .from('venture_exit_readiness')
    .update({ status: 'aborted' })
    .eq('venture_id', ventureId);

  await supabase.from('eva_event_bus').insert({
    event_type: 'exit_aborted',
    payload: { venture_id: ventureId, aborted_at_round: state.current_round },
    source: 'execute-exit',
    priority: 'normal',
  });

  return new Response(
    JSON.stringify({
      message: 'Exit process aborted',
      venture_id: ventureId,
      aborted_at_round: state.current_round,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
