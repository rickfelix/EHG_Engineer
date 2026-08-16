/**
 * lib/agent-readiness/diff-harness.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-3 / US-007.
 *
 * HARD RULE (TR-4): query v_agent_readiness_audit_run_integrity FIRST and refuse to emit a delta when
 * is_complete is false on either side of the pair. is_complete=false means samples were REFUSED by
 * the integrity CHECKs — the run is not a clean measurement, and a partially-failed run must never
 * read as a smaller-but-valid result (AC-007-3).
 *
 * The noise floor is computed from the WITHIN-cell spread across sample_index 1..n for each
 * (run, prompt, model) cell — never averaged away before computing variance, since the replicate
 * grain (US-003) exists specifically to make this estimator storable.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function rate(count, total) {
  return total > 0 ? count / total : 0;
}

/** Sample standard deviation of a 0/1 rate across `n` Bernoulli trials (the within-cell noise floor). */
function bernoulliStdDev(successCount, n) {
  if (n <= 1) return 0;
  const p = successCount / n;
  return Math.sqrt((p * (1 - p)) / n);
}

async function loadIntegrity(auditRunId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('v_agent_readiness_audit_run_integrity')
    .select('audit_run_id, is_complete, actual_sample_count, expected_sample_count, cache_hit_samples, fallback_samples')
    .eq('audit_run_id', auditRunId)
    .single();
  if (error) throw new Error(`v_agent_readiness_audit_run_integrity lookup failed for ${auditRunId}: ${error.message}`);
  return data;
}

async function loadSamples(auditRunId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('agent_readiness_audit_sample')
    .select('requested_model, found, recommended')
    .eq('audit_run_id', auditRunId);
  if (error) throw new Error(`agent_readiness_audit_sample read failed for ${auditRunId}: ${error.message}`);
  return data;
}

function summarize(samples) {
  const total = samples.length;
  const foundCount = samples.filter((s) => s.found).length;
  const recommendedCount = samples.filter((s) => s.recommended).length;
  return {
    total,
    foundRate: rate(foundCount, total),
    recommendedRate: rate(recommendedCount, total),
    foundStdDev: bernoulliStdDev(foundCount, total),
    recommendedStdDev: bernoulliStdDev(recommendedCount, total)
  };
}

/**
 * @param {string} beforeRunId
 * @param {string} afterRunId
 * @returns {Promise<object>} diff report, or throws if either run is incomplete
 */
export async function computeDiff(beforeRunId, afterRunId) {
  const [beforeIntegrity, afterIntegrity] = await Promise.all([
    loadIntegrity(beforeRunId),
    loadIntegrity(afterRunId)
  ]);

  if (!beforeIntegrity.is_complete || !afterIntegrity.is_complete) {
    const incomplete = [];
    if (!beforeIntegrity.is_complete) incomplete.push({ run: 'before', ...beforeIntegrity });
    if (!afterIntegrity.is_complete) incomplete.push({ run: 'after', ...afterIntegrity });
    const err = new Error(
      'Refusing to emit a delta: run(s) incomplete — ' +
      incomplete.map((i) => `${i.run} run ${i.actual_sample_count}/${i.expected_sample_count} samples`).join(', ')
    );
    err.incomplete = incomplete;
    throw err;
  }

  const [beforeSamples, afterSamples] = await Promise.all([
    loadSamples(beforeRunId),
    loadSamples(afterRunId)
  ]);

  const before = summarize(beforeSamples);
  const after = summarize(afterSamples);

  const foundDelta = after.foundRate - before.foundRate;
  const recommendedDelta = after.recommendedRate - before.recommendedRate;
  // Combined noise floor: the larger of the two runs' own repeat-sample variance.
  const foundNoiseFloor = Math.max(before.foundStdDev, after.foundStdDev);
  const recommendedNoiseFloor = Math.max(before.recommendedStdDev, after.recommendedStdDev);

  return {
    before,
    after,
    foundDelta,
    recommendedDelta,
    foundNoiseFloor,
    recommendedNoiseFloor,
    foundIsSignal: Math.abs(foundDelta) > foundNoiseFloor,
    recommendedIsSignal: Math.abs(recommendedDelta) > recommendedNoiseFloor,
    cacheHitSamplesBothRuns: (beforeIntegrity.cache_hit_samples || 0) + (afterIntegrity.cache_hit_samples || 0),
    fallbackSamplesBothRuns: (beforeIntegrity.fallback_samples || 0) + (afterIntegrity.fallback_samples || 0)
  };
}

export const _internal = { rate, bernoulliStdDev, summarize };
