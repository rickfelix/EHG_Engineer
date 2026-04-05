import { scoreVenture } from './policy-engine.js';
import { writeAuditEntry } from './audit-writer.js';
import { getActivePolicy } from './policy-reader.js';

/**
 * Dry-run score a single venture. Writes audit but not venture columns.
 * @param {object} ventureData
 * @param {object} [options]
 * @param {object} [options.policy] - Override policy (default: active policy)
 * @param {string} [options.actor='system']
 * @returns {Promise<object>} ScoreResult
 */
export async function dryRunScore(ventureData, options = {}) {
  const policy = options.policy || await getActivePolicy();
  const result = scoreVenture(ventureData, policy);

  await writeAuditEntry({
    eventType: 'DRY_RUN',
    policyId: policy.id,
    policyVersion: policy.policy_version,
    actor: options.actor || 'system',
    ventureId: ventureData.id || null,
    scoreOutput: result,
    dryRun: true
  });

  return { ...result, dry_run: true };
}

/**
 * Dry-run a policy activation across multiple ventures.
 * Scores all ventures against the candidate policy without writing venture columns.
 * @param {string} policyId - UUID of the candidate policy.
 * @param {Array<object>} ventures - Array of venture data objects.
 * @param {string} actor
 * @returns {Promise<object>} DryRunReport with per-venture diffs and aggregate stats.
 */
export async function dryRunPolicyActivation(policyId, ventures, actor) {
  const { default: dotenv } = await import('dotenv');
  dotenv.config();
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: candidate, error } = await supabase
    .from('portfolio_allocation_policies')
    .select('*')
    .eq('id', policyId)
    .single();

  if (error || !candidate) throw new Error(`Candidate policy ${policyId} not found`);

  let currentPolicy = null;
  try { currentPolicy = await getActivePolicy(candidate.policy_key); } catch { /* none */ }

  const results = [];
  const changes = { growth_strategy: 0, time_horizon: 0, phase: 0 };
  const phaseDistribution = {};

  for (const venture of ventures) {
    const newScore = scoreVenture(venture, candidate);
    const oldScore = currentPolicy ? scoreVenture(venture, currentPolicy) : null;

    const ventureResult = {
      venture_id: venture.id,
      venture_name: venture.name,
      new: newScore,
      old: oldScore,
      changed: {
        growth_strategy: oldScore ? oldScore.growth_strategy !== newScore.growth_strategy : true,
        time_horizon: oldScore ? oldScore.time_horizon_classification !== newScore.time_horizon_classification : true,
        phase: oldScore ? oldScore.phase !== newScore.phase : true
      }
    };

    if (ventureResult.changed.growth_strategy) changes.growth_strategy++;
    if (ventureResult.changed.time_horizon) changes.time_horizon++;
    if (ventureResult.changed.phase) changes.phase++;

    phaseDistribution[newScore.phase] = (phaseDistribution[newScore.phase] || 0) + 1;
    results.push(ventureResult);
  }

  await writeAuditEntry({
    eventType: 'DRY_RUN',
    policyId: candidate.id,
    policyVersion: candidate.policy_version,
    actor,
    scoreOutput: { venture_count: ventures.length, changes, phaseDistribution },
    dryRun: true
  });

  return {
    candidate_policy: { id: candidate.id, version: candidate.policy_version, key: candidate.policy_key },
    current_policy: currentPolicy ? { id: currentPolicy.id, version: currentPolicy.policy_version } : null,
    venture_count: ventures.length,
    changes,
    phase_distribution: phaseDistribution,
    per_venture: results,
    dry_run: true
  };
}
