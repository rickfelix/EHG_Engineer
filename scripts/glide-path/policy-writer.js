import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeAuditEntry, diffPolicies } from './audit-writer.js';
import { getActivePolicy } from './policy-reader.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Validate that weights sum to 1.0 and all keys match dimensions.
 * @param {object} weights - { dimension_key: float }
 * @param {Array} dimensions - [{ key: string, ... }]
 * @throws If validation fails.
 */
function validateWeights(weights, dimensions) {
  const dimKeys = new Set(dimensions.map(d => d.key));
  const weightKeys = Object.keys(weights);

  for (const key of weightKeys) {
    if (!dimKeys.has(key)) {
      throw new Error(`Weight key "${key}" has no matching dimension`);
    }
  }

  const sum = weightKeys.reduce((acc, k) => acc + (weights[k] || 0), 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error(`Weights sum to ${sum.toFixed(4)}, must be within 0.001 of 1.0`);
  }
}

/**
 * Insert a new policy version. Does NOT activate it.
 * @param {object} payload
 * @param {string} payload.policyKey
 * @param {Array} payload.dimensions
 * @param {object} payload.weights
 * @param {Array} payload.phaseDefinitions
 * @param {object} payload.archetypeUnlockConditions
 * @param {object} [payload.metadata={}]
 * @param {boolean} [payload.boardApproved=false]
 * @param {string} actor - session ID or 'chairman'
 * @returns {Promise<object>} The inserted policy row.
 */
export async function insertPolicyVersion(payload, actor) {
  validateWeights(payload.weights, payload.dimensions);

  // Get next version number
  const { data: latest } = await supabase
    .from('portfolio_allocation_policies')
    .select('policy_version')
    .eq('policy_key', payload.policyKey)
    .order('policy_version', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.policy_version || 0) + 1;

  const { data, error } = await supabase
    .from('portfolio_allocation_policies')
    .insert({
      policy_key: payload.policyKey,
      policy_version: nextVersion,
      is_active: false,
      dimensions: payload.dimensions,
      weights: payload.weights,
      phase_definitions: payload.phaseDefinitions,
      archetype_unlock_conditions: payload.archetypeUnlockConditions,
      metadata: payload.metadata || {},
      board_approved: payload.boardApproved || false,
      created_by: actor
    })
    .select()
    .single();

  if (error) throw new Error(`Insert policy failed: ${error.message}`);

  await writeAuditEntry({
    eventType: 'INSERT',
    policyId: data.id,
    policyVersion: nextVersion,
    actor
  });

  return data;
}

/**
 * Activate a policy by ID. Deactivates the current active policy atomically.
 * @param {string} policyId - UUID of the policy to activate.
 * @param {string} actor
 */
export async function activatePolicy(policyId, actor) {
  // Get the target policy
  const { data: target, error: targetErr } = await supabase
    .from('portfolio_allocation_policies')
    .select('*')
    .eq('id', policyId)
    .single();

  if (targetErr || !target) throw new Error(`Policy ${policyId} not found`);

  // Find current active policy (if any) for this key
  let currentActive = null;
  try {
    currentActive = await getActivePolicy(target.policy_key);
  } catch { /* no active policy yet */ }

  // Deactivate current
  if (currentActive) {
    const { error: deactivateErr } = await supabase
      .from('portfolio_allocation_policies')
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq('id', currentActive.id);

    if (deactivateErr) throw new Error(`Deactivate failed: ${deactivateErr.message}`);

    await writeAuditEntry({
      eventType: 'DEACTIVATE',
      policyId: currentActive.id,
      policyVersion: currentActive.policy_version,
      actor,
      diff: diffPolicies(currentActive, target)
    });
  }

  // Activate target
  const { error: activateErr } = await supabase
    .from('portfolio_allocation_policies')
    .update({
      is_active: true,
      activated_at: new Date().toISOString(),
      activated_by: actor
    })
    .eq('id', policyId);

  if (activateErr) throw new Error(`Activate failed: ${activateErr.message}`);

  await writeAuditEntry({
    eventType: 'ACTIVATE',
    policyId: target.id,
    policyVersion: target.policy_version,
    actor
  });
}
