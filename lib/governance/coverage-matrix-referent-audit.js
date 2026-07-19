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

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: matrix reads paginate past the
// PostgREST 1000-row cap — composite (surface_class, surface_key) ordering gives the matrix
// a stable total order. Fail-loud posture preserved for genuine errors: a pagination failure
// still throws, matching each site's pre-existing query-error policy.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const SAMPLE_SIZE = 3;

export async function computeDelta(supabase, sinceIso) {
  let data;
  try {
    data = await fetchAllPaginated(() => {
      let q = supabase.from('coverage_matrix').select('surface_class, surface_key, status, is_active, first_seen_at, updated_at');
      if (sinceIso) q = q.gt('updated_at', sinceIso);
      return q.order('surface_class').order('surface_key'); // composite unique key
    });
  } catch (e) {
    throw new Error(`computeDelta: query failed: ${(e && e.message) || String(e)}`);
  }

  const rows = data || [];
  return {
    new_unchecked: rows.filter((r) => r.status === 'unchecked' && (!sinceIso || r.first_seen_at > sinceIso)),
    newly_stale: rows.filter((r) => r.status === 'stale'),
    newly_dormant: rows.filter((r) => r.is_active === false && r.status === 'covered'),
  };
}

/** Fisher-Yates shuffle, not the biased sort-by-random-comparator pattern. */
export function selectSampleVerificationCandidates(coveredRows, sampleSize = SAMPLE_SIZE) {
  const shuffled = [...coveredRows];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
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

  const { data: lastRun, error: lastRunError } = await supabase
    .from('coverage_matrix_rotation_runs')
    .select('ran_at')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  // Fail closed: a query error here must not be silently treated as "no prior run" (cold start),
  // which would over-broaden the delta and re-flag everything as new.
  if (lastRunError) throw new Error(`runRotation: last-run query failed: ${lastRunError.message}`);
  const sinceIso = lastRun?.ran_at || null; // null = genuine cold start, treat entire matrix as delta

  const delta = await computeDelta(supabase, sinceIso);

  // FR-6: paginated (see header note); fail-loud throw policy preserved via the wrap.
  let coveredRows;
  try {
    coveredRows = await fetchAllPaginated(() => supabase
      .from('coverage_matrix')
      .select('surface_class, surface_key')
      .eq('status', 'covered')
      .order('surface_class').order('surface_key')); // composite unique key
  } catch (e) {
    throw new Error(`runRotation: covered-rows query failed: ${(e && e.message) || String(e)}`);
  }
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
  if (insertRunError) {
    // The check-then-insert above is a TOCTOU race under concurrent invocation; the DB-level
    // idx_coverage_matrix_rotation_runs_month unique index converts a lost race into a loud
    // constraint violation (23505) here, which we treat as a graceful skip rather than a crash.
    if (insertRunError.code === '23505') {
      return { skipped: true, reason: 'concurrent_run_won_race', feedbackIds };
    }
    throw new Error(`runRotation: rotation-run insert failed: ${insertRunError.message}`);
  }

  return { skipped: false, delta, sampleCandidates, feedbackIds };
}

export default { computeDelta, selectSampleVerificationCandidates, emitCoverageQuestions, runRotation };
