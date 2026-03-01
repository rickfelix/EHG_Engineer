/**
 * Governance Policy Checker (V09 FR-005)
 *
 * Evaluates SDs against governance_policies rules.
 * Called from blocker-resolution.js to add policy-based blocking signals.
 *
 * Usage:
 *   import { checkGovernancePolicies } from './lib/governance-policy-checker.js';
 *   const result = await checkGovernancePolicies(supabase, sdId, { ancestorChain });
 */

import { getAncestorChain, MAX_HIERARCHY_DEPTH } from './sd-hierarchy-mapper.js';

/**
 * Check an SD against all active governance policies.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - The sd_key or UUID of the SD to check
 * @param {Object} [context] - Optional context to avoid redundant queries
 * @param {Array} [context.ancestorChain] - Pre-fetched ancestor chain
 * @param {Object} [context.sd] - Pre-fetched SD record
 * @param {Array} [context.children] - Pre-fetched children (for orchestrators)
 * @returns {Promise<Object>} { violations: Array, blockers: Array, warnings: Array, advisories: Array }
 */
export async function checkGovernancePolicies(supabase, sdId, context = {}) {
  const violations = [];

  // Load policies
  const { data: policies, error: policyError } = await supabase
    .from('governance_policies')
    .select('*')
    .eq('is_active', true);

  if (policyError || !policies || policies.length === 0) {
    // Table doesn't exist or no policies — pass through (fail-open)
    return { violations: [], blockers: [], warnings: [], advisories: [] };
  }

  // Load SD if not provided
  const sd = context.sd || await fetchSD(supabase, sdId);
  if (!sd) {
    return { violations: [], blockers: [], warnings: [], advisories: [] };
  }

  // Load ancestor chain if not provided
  const ancestorChain = context.ancestorChain || await safeGetAncestorChain(sd.sd_key || sd.id);

  // Evaluate each policy
  for (const policy of policies) {
    const violation = await evaluatePolicy(supabase, policy, sd, ancestorChain, context);
    if (violation) {
      violations.push(violation);
    }
  }

  return {
    violations,
    blockers: violations.filter(v => v.enforcement_level === 'blocking'),
    warnings: violations.filter(v => v.enforcement_level === 'warning'),
    advisories: violations.filter(v => v.enforcement_level === 'advisory')
  };
}

/**
 * Evaluate a single policy against an SD.
 */
async function evaluatePolicy(supabase, policy, sd, ancestorChain, context) {
  const rule = policy.rule;
  if (!rule || !rule.type) return null;

  switch (rule.type) {
    case 'max_depth':
      return checkMaxDepth(policy, sd, ancestorChain, rule);

    case 'cross_boundary_dependency':
      return await checkCrossBoundary(supabase, policy, sd, ancestorChain, rule);

    case 'escalation_threshold':
      return checkEscalationThreshold(policy, sd, ancestorChain, rule);

    case 'max_children':
      return await checkMaxChildren(supabase, policy, sd, context, rule);

    case 'parent_lifecycle_check':
      return checkParentLifecycle(policy, sd, ancestorChain, rule);

    default:
      return null;
  }
}

/**
 * GOV-DEPTH-LIMIT: Check if SD exceeds max hierarchy depth.
 */
function checkMaxDepth(policy, sd, ancestorChain, rule) {
  const depth = ancestorChain.length + 1; // +1 for the SD itself
  if (depth > rule.max_depth) {
    return {
      policy_key: policy.policy_key,
      title: policy.title,
      enforcement_level: policy.enforcement_level,
      message: `SD is at depth ${depth}, exceeding limit of ${rule.max_depth}`,
      sd_key: sd.sd_key || sd.id,
      details: { depth, max_depth: rule.max_depth }
    };
  }
  return null;
}

/**
 * GOV-CROSS-BOUNDARY: Check dependencies crossing hierarchy boundaries.
 */
async function checkCrossBoundary(supabase, policy, sd, ancestorChain, rule) {
  // Only relevant if SD has dependencies
  if (!sd.dependencies) return null;

  let deps;
  try {
    deps = typeof sd.dependencies === 'string' ? JSON.parse(sd.dependencies) : sd.dependencies;
  } catch { return null; }

  if (!Array.isArray(deps) || deps.length === 0) return null;

  const ancestorIds = new Set(ancestorChain.map(a => a.id));
  if (sd.parent_sd_id) ancestorIds.add(sd.parent_sd_id);

  for (const dep of deps) {
    const depKey = typeof dep === 'string' ? dep.match(/^(SD-[A-Z0-9-]+)/)?.[1] : dep?.sd_id;
    if (!depKey) continue;

    // Fetch dependency's ancestor chain
    const depAncestors = await safeGetAncestorChain(depKey);
    const depAncestorIds = new Set(depAncestors.map(a => a.id));

    // Check if they share a common ancestor
    const hasCommonAncestor = [...ancestorIds].some(id => depAncestorIds.has(id));

    if (!hasCommonAncestor && depAncestors.length > 0) {
      return {
        policy_key: policy.policy_key,
        title: policy.title,
        enforcement_level: policy.enforcement_level,
        message: `Dependency on ${depKey} crosses hierarchy boundary (no common ancestor)`,
        sd_key: sd.sd_key || sd.id,
        details: { dependency: depKey, cross_boundary: true }
      };
    }
  }

  return null;
}

/**
 * GOV-APPROVAL-ESCALATION: Check if deep SDs need escalation.
 */
function checkEscalationThreshold(policy, sd, ancestorChain, rule) {
  const depth = ancestorChain.length + 1;
  if (depth >= rule.depth_threshold && sd.current_phase === 'EXEC') {
    return {
      policy_key: policy.policy_key,
      title: policy.title,
      enforcement_level: policy.enforcement_level,
      message: `SD at depth ${depth} (>= ${rule.depth_threshold}) — parent orchestrator acknowledgment recommended`,
      sd_key: sd.sd_key || sd.id,
      details: { depth, threshold: rule.depth_threshold, escalation_target: rule.escalation_target }
    };
  }
  return null;
}

/**
 * GOV-CHILD-CAP: Check if orchestrator has too many children.
 */
async function checkMaxChildren(supabase, policy, sd, context, rule) {
  // Only applies to orchestrators
  if (sd.sd_type !== 'orchestrator' && !sd.relationship_type?.includes('orchestrator')) return null;

  const children = context.children || await fetchChildren(supabase, sd.id);
  if (children.length > rule.max_children) {
    return {
      policy_key: policy.policy_key,
      title: policy.title,
      enforcement_level: policy.enforcement_level,
      message: `Orchestrator has ${children.length} children, exceeding limit of ${rule.max_children}`,
      sd_key: sd.sd_key || sd.id,
      details: { child_count: children.length, max_children: rule.max_children }
    };
  }
  return null;
}

/**
 * GOV-ORPHAN-PREVENTION: Check if parent is cancelled/completed while child is active.
 */
function checkParentLifecycle(policy, sd, ancestorChain, rule) {
  if (!sd.parent_sd_id || ancestorChain.length === 0) return null;

  const affectedStatuses = rule.child_statuses_affected || ['draft', 'active', 'in_progress'];
  if (!affectedStatuses.includes(sd.status)) return null;

  // Check immediate parent (depth 0 in ancestor chain)
  const parent = ancestorChain[0];
  if (!parent) return null;

  const triggerStatuses = rule.trigger_on || ['parent_cancelled', 'parent_completed'];
  const parentTriggered =
    (triggerStatuses.includes('parent_cancelled') && parent.status === 'cancelled') ||
    (triggerStatuses.includes('parent_completed') && parent.status === 'completed');

  if (parentTriggered) {
    return {
      policy_key: policy.policy_key,
      title: policy.title,
      enforcement_level: policy.enforcement_level,
      message: `Parent ${parent.sd_key} is ${parent.status} but child is still ${sd.status}`,
      sd_key: sd.sd_key || sd.id,
      details: { parent_sd_key: parent.sd_key, parent_status: parent.status, child_status: sd.status }
    };
  }
  return null;
}

// Helper: fetch SD record
async function fetchSD(supabase, sdId) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, parent_sd_id, sd_type, relationship_type, dependencies')
    .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
    .eq('is_active', true)
    .single();
  return data;
}

// Helper: fetch children
async function fetchChildren(supabase, parentId) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status')
    .eq('parent_sd_id', parentId)
    .eq('is_active', true);
  return data || [];
}

// Helper: safe ancestor chain fetch (non-throwing)
async function safeGetAncestorChain(sdId) {
  try {
    return await getAncestorChain(sdId, MAX_HIERARCHY_DEPTH);
  } catch {
    return [];
  }
}

export default { checkGovernancePolicies };
