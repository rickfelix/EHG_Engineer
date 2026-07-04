/**
 * Monthly referent-audit rotation -- SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001, FR-6.
 *
 * Computes the delta since the last rotation (new unchecked / newly-stale / newly-dormant
 * surfaces), selects 2-3 claimed-covered cells for sample-verification, and emits both as
 * coverage questions to Adam's feedback inbox. Sample-verification of a selected cell is an
 * observational judgment call (does the claimed checker actually still cover this surface) --
 * this module does NOT automate that verification itself; it surfaces the question so a
 * different actor/process closes it (anti-Goodhart: closure by a different actor than the one
 * being scored).
 */

const SAMPLE_SIZE = 3;

export async function computeDelta(supabase, sinceIso) {
  const query = supabase.from('coverage_matrix').select('surface_class, surface_key, status, is_active, first_seen_at, updated_at');
  const { data, error } = sinceIso ? await query.gt('updated_at', sinceIso) : await query;
  if (error) throw new Error(`computeDelta: query failed: ${error.message}`);

  const rows = data || [];
  return {
    new_unchecked: rows.filter((r) => r.status === 'unchecked' && (!sinceIso || r.first_seen_at > sinceIso)),
    newly_stale: rows.filter((r) => r.status === 'stale'),
    newly_dormant: rows.filter((r) => r.is_active === false && r.status === 'covered'),
  };
}

export function selectSampleVerificationCandidates(coveredRows, sampleSize = SAMPLE_SIZE) {
  const shuffled = [...coveredRows].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(sampleSize, shuffled.length));
}

export async function emitCoverageQuestions(supabase, { delta, sampleCandidates }) {
  const feedbackIds = [];
  const hasFindings = delta.new_unchecked.length > 0 || delta.newly_stale.length > 0 || delta.newly_dormant.length > 0;

  if (hasFindings) {
    const { data, error } = await supabase.from('feedback').insert({
      type: 'issue',
      category: 'coverage_audit_question',
      priority: 'P2',
      status: 'new',
      title: `Coverage-matrix delta: ${delta.new_unchecked.length} new unchecked, ${delta.newly_stale.length} newly stale, ${delta.newly_dormant.length} newly dormant`,
      description: 'Monthly referent-audit rotation delta (SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001). Review and source follow-up work for any genuinely-unwatched surface.',
      source_type: 'coverage-matrix-referent-audit',
      metadata: { delta },
    }).select('id').single();
    if (error) throw new Error(`emitCoverageQuestions: delta insert failed: ${error.message}`);
    feedbackIds.push(data.id);
  }

  for (const candidate of sampleCandidates) {
    const { data, error } = await supabase.from('feedback').insert({
      type: 'issue',
      category: 'coverage_audit_question',
      priority: 'P3',
      status: 'new',
      title: `Sample-verify claimed coverage: ${candidate.surface_class}/${candidate.surface_key}`,
      description: 'This cell claims checker coverage. Direct-observation verdict requested: is the claimed checker still real/effective for this surface? (SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001 monthly rotation, anti-Goodhart sample-verification.)',
      source_type: 'coverage-matrix-referent-audit',
      metadata: { candidate },
    }).select('id').single();
    if (error) throw new Error(`emitCoverageQuestions: sample-verify insert failed: ${error.message}`);
    feedbackIds.push(data.id);
  }

  return feedbackIds;
}

/** Idempotent within a calendar month: a rotation that already ran this month is a no-op. */
export async function runRotation(supabase) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { data: recentRuns, error: runsError } = await supabase
    .from('coverage_matrix_rotation_runs')
    .select('id, ran_at')
    .gte('ran_at', monthStart)
    .limit(1);
  if (runsError) throw new Error(`runRotation: rotation-runs query failed: ${runsError.message}`);
  if (recentRuns && recentRuns.length > 0) {
    return { skipped: true, reason: 'already_ran_this_period', priorRun: recentRuns[0] };
  }

  const { data: lastRun } = await supabase
    .from('coverage_matrix_rotation_runs')
    .select('ran_at')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sinceIso = lastRun?.ran_at || null; // null = cold start, treat entire matrix as delta

  const delta = await computeDelta(supabase, sinceIso);

  const { data: coveredRows, error: coveredError } = await supabase
    .from('coverage_matrix')
    .select('surface_class, surface_key')
    .eq('status', 'covered');
  if (coveredError) throw new Error(`runRotation: covered-rows query failed: ${coveredError.message}`);
  const sampleCandidates = selectSampleVerificationCandidates(coveredRows || []);

  const feedbackIds = await emitCoverageQuestions(supabase, { delta, sampleCandidates });

  const { error: insertRunError } = await supabase.from('coverage_matrix_rotation_runs').insert({
    delta_summary: {
      new_unchecked: delta.new_unchecked.length,
      newly_stale: delta.newly_stale.length,
      newly_dormant: delta.newly_dormant.length,
    },
    sample_verified_keys: sampleCandidates.map((c) => `${c.surface_class}/${c.surface_key}`),
    coverage_question_feedback_ids: feedbackIds,
  });
  if (insertRunError) throw new Error(`runRotation: rotation-run insert failed: ${insertRunError.message}`);

  return { skipped: false, delta, sampleCandidates, feedbackIds };
}

export default { computeDelta, selectSampleVerificationCandidates, emitCoverageQuestions, runRotation };
