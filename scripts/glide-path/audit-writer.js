import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Write an immutable audit entry.
 * @param {object} entry
 * @param {string} entry.eventType - INSERT | ACTIVATE | DEACTIVATE | DRY_RUN | SCORE_RUN
 * @param {string} entry.policyId - UUID of the policy
 * @param {number} entry.policyVersion
 * @param {string} entry.actor - session ID or 'system'
 * @param {string} [entry.ventureId] - UUID of venture (for SCORE_RUN)
 * @param {object} [entry.diff] - before/after for mutations
 * @param {object} [entry.scoreOutput] - scoring result (for SCORE_RUN / DRY_RUN)
 * @param {boolean} [entry.dryRun=false]
 * @returns {Promise<object>} The created audit entry.
 */
export async function writeAuditEntry({ eventType, policyId, policyVersion, actor, ventureId, diff, scoreOutput, dryRun = false }) {
  const { data, error } = await supabase
    .from('policy_audit_log')
    .insert({
      event_type: eventType,
      policy_id: policyId,
      policy_version: policyVersion,
      actor,
      venture_id: ventureId || null,
      diff: diff || null,
      score_output: scoreOutput || null,
      dry_run: dryRun
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Audit write failed: ${error.message}`);
  }
  return data;
}

/**
 * Compute diff between two policy objects.
 * @param {object} oldPolicy
 * @param {object} newPolicy
 * @returns {object} Changed fields with before/after values.
 */
export function diffPolicies(oldPolicy, newPolicy) {
  const diff = {};
  const fields = ['dimensions', 'weights', 'phase_definitions', 'archetype_unlock_conditions', 'metadata'];
  for (const field of fields) {
    const oldVal = JSON.stringify(oldPolicy?.[field]);
    const newVal = JSON.stringify(newPolicy?.[field]);
    if (oldVal !== newVal) {
      diff[field] = { before: oldPolicy?.[field], after: newPolicy?.[field] };
    }
  }
  return diff;
}
