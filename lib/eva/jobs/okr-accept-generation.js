/**
 * OKR Accept-Generation Handler
 *
 * SD: SD-LEO-INFRA-REVIVE-EVA-ACCEPTANCE-STATE-001
 *
 * The inverse of okr-archive-stale.js. The monthly generator (when
 * OKR_REQUIRE_ACCEPTANCE is on) lands new objectives + key_results at
 * is_active:false and marks the okr_generation_log row
 * status='pending_chairman_acceptance', so the generation is hidden from every
 * is_active=true surface until the chairman accepts it in the Friday flow.
 *
 * This module flips a pending generation live:
 *   1. objectives  → is_active:true   (keyed by generation_id)
 *   2. key_results → is_active:true   (keyed by the parent objectives' ids —
 *                                      key_results has no generation_id column)
 *   3. okr_generation_log → status:'completed'  (keyed by id)
 *
 * Dependency-injected, idempotent, and fail-loud. The acceptance *audit* (who
 * accepted, notes) is recorded by the caller via the existing
 * lib/eva-support/friday-outcome-bridge writeFridayOutcome seam — not here —
 * because management_reviews.chairman_* columns are dormant (never written) and
 * writeFridayOutcome is the working audit channel.
 *
 * @module lib/eva/jobs/okr-accept-generation
 */

/**
 * Accept a pending OKR generation, flipping its objectives + key_results live.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase     - Supabase client (service-role)
 * @param {string} deps.generationId - okr_generation_log.id of the pending generation
 * @param {Object} [deps.logger]     - Logger (defaults to console)
 * @returns {Promise<{accepted: boolean, alreadyAccepted: boolean, generationId: string, objectives: number, keyResults: number}>}
 */
export async function acceptPendingOkrGeneration({ supabase, generationId, logger = console }) {
  if (!supabase) throw new Error('acceptPendingOkrGeneration: supabase client is required');
  if (!generationId) throw new Error('acceptPendingOkrGeneration: generationId is required');

  // 1. Load the generation log row and gate on its status (idempotent).
  const { data: gen, error: genErr } = await supabase
    .from('okr_generation_log')
    .select('id, status, period')
    .eq('id', generationId)
    .single();

  if (genErr) {
    throw new Error(`acceptPendingOkrGeneration: failed to load generation ${generationId}: ${genErr.message}`);
  }
  if (!gen) {
    throw new Error(`acceptPendingOkrGeneration: generation ${generationId} not found`);
  }
  if (gen.status !== 'pending_chairman_acceptance') {
    // Already accepted (completed) or otherwise not pending → no-op (idempotent).
    logger.log(`[OKR-Accept] Generation ${generationId} is '${gen.status}', not pending — no-op`);
    return { accepted: false, alreadyAccepted: gen.status === 'completed', generationId, objectives: 0, keyResults: 0 };
  }

  // 2. Resolve this generation's objective ids (key_results have no generation_id).
  const { data: objs, error: objSelErr } = await supabase
    .from('objectives')
    .select('id')
    .eq('generation_id', generationId);

  if (objSelErr) {
    throw new Error(`acceptPendingOkrGeneration: failed to resolve objectives for ${generationId}: ${objSelErr.message}`);
  }
  const objectiveIds = (objs || []).map((o) => o.id);

  // 3. Flip the objectives live.
  const { data: updObjs, error: objUpdErr } = await supabase
    .from('objectives')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('generation_id', generationId)
    .select('id');

  if (objUpdErr) {
    throw new Error(`acceptPendingOkrGeneration: failed to activate objectives for ${generationId}: ${objUpdErr.message}`);
  }

  // 4. Flip the key_results live (via parent objective ids).
  let keyResults = 0;
  if (objectiveIds.length > 0) {
    const { data: updKRs, error: krUpdErr } = await supabase
      .from('key_results')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .in('objective_id', objectiveIds)
      .select('id');

    if (krUpdErr) {
      throw new Error(`acceptPendingOkrGeneration: failed to activate key_results for ${generationId}: ${krUpdErr.message}`);
    }
    keyResults = (updKRs || []).length;
  }

  // 5. Mark the generation completed.
  const { error: logUpdErr } = await supabase
    .from('okr_generation_log')
    .update({ status: 'completed' })
    .eq('id', generationId);

  if (logUpdErr) {
    throw new Error(`acceptPendingOkrGeneration: failed to complete generation log ${generationId}: ${logUpdErr.message}`);
  }

  const objectives = (updObjs || []).length;
  logger.log(`[OKR-Accept] Accepted generation ${generationId} (period ${gen.period}): ${objectives} objective(s), ${keyResults} KR(s) now live`);
  return { accepted: true, alreadyAccepted: false, generationId, objectives, keyResults };
}

/**
 * List pending OKR generations awaiting chairman acceptance (for the Friday flow).
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (service-role)
 * @returns {Promise<Array<{id: string, period: string, generation_date: string, total_krs_generated: number}>>}
 */
export async function listPendingOkrGenerations({ supabase }) {
  if (!supabase) throw new Error('listPendingOkrGenerations: supabase client is required');
  const { data, error } = await supabase
    .from('okr_generation_log')
    .select('id, period, generation_date, total_krs_generated')
    .eq('status', 'pending_chairman_acceptance')
    .order('generation_date', { ascending: false });

  if (error) {
    throw new Error(`listPendingOkrGenerations: ${error.message}`);
  }
  return data || [];
}
