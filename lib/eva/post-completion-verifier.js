/**
 * Post-Completion Verifier Module
 * SD: SD-LEO-PROTOCOL-PCVP-COMPLETION-INTEGRITY-001-B
 *
 * Provides programmatic verification of SD completion integrity.
 * Checks handoff chains, PR merge evidence, test evidence, and
 * stores results in sd_verification_results + pcvp_verification_log.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
// SD-LEO-INFRA-STRENGTHEN-COMPLETION-DELIVERABLE-001: live-end-state deliverable canary.
import { runDeliverableCanary, canaryEnforceEnabled } from './deliverable-canary.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Tiered verification intensity by SD type
const VERIFICATION_TIERS = {
  feature:        { tier: 'high',     checks: ['handoff_chain', 'pr_evidence', 'test_evidence', 'quality_gate'] },
  security:       { tier: 'high',     checks: ['handoff_chain', 'pr_evidence', 'test_evidence', 'quality_gate'] },
  bugfix:         { tier: 'high',     checks: ['handoff_chain', 'pr_evidence', 'test_evidence'] },
  infrastructure: { tier: 'standard', checks: ['handoff_chain', 'pr_evidence'] },
  refactor:       { tier: 'standard', checks: ['handoff_chain', 'pr_evidence', 'test_evidence'] },
  enhancement:    { tier: 'standard', checks: ['handoff_chain', 'pr_evidence'] },
  orchestrator:   { tier: 'light',    checks: ['handoff_chain'] },
  documentation:  { tier: 'light',    checks: ['handoff_chain'] },
  database:       { tier: 'standard', checks: ['handoff_chain'] },
  performance:    { tier: 'standard', checks: ['handoff_chain', 'pr_evidence', 'test_evidence'] },
};

async function checkHandoffChain(sdId) {
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, validation_score')
    .eq('sd_id', sdId)
    .eq('status', 'accepted');

  if (error) return { pass: false, score: 0, detail: error.message };

  const count = data?.length || 0;
  return {
    pass: count > 0,
    score: Math.min(100, count * 25),
    detail: `${count} accepted handoff(s)`,
    handoffs: data?.map(h => h.handoff_type) || []
  };
}

async function checkPREvidence(sdId, sdKey) {
  const { data, error } = await supabase
    .from('shipping_decisions')
    .select('decision_type, decision, executed_at')
    .or(`sd_id.eq.${sdId},sd_id.eq.${sdKey || ''}`)
    .in('decision_type', ['PR_MERGE', 'PR_CREATION']);

  if (error) return { pass: false, score: 0, detail: error.message };

  const merges = data?.filter(d => d.decision_type === 'PR_MERGE') || [];
  return {
    pass: merges.length > 0,
    score: merges.length > 0 ? 100 : 0,
    detail: `${merges.length} PR merge(s), ${data?.length || 0} total decisions`
  };
}

async function checkTestEvidence(sdId) {
  const { data: stories } = await supabase
    .from('user_stories')
    .select('id, status, acceptance_criteria')
    .eq('sd_id', sdId);

  if (!stories || stories.length === 0) {
    return { pass: false, score: 0, detail: 'No user stories found' };
  }

  const completed = stories.filter(s => s.status === 'completed');
  const validated = stories.filter(s => {
    if (!Array.isArray(s.acceptance_criteria)) return false;
    return s.acceptance_criteria.some(ac => ac.validated === true);
  });

  const score = Math.round((completed.length / stories.length) * 100);
  return {
    pass: score >= 70,
    score,
    detail: `${completed.length}/${stories.length} stories completed, ${validated.length} with validated AC`
  };
}

async function checkQualityGate(sdId) {
  const { data } = await supabase
    .from('sd_phase_handoffs')
    .select('validation_score')
    .eq('sd_id', sdId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const score = data?.validation_score || 0;
  return {
    pass: score >= 70,
    score,
    detail: `Latest handoff validation score: ${score}`
  };
}

/**
 * Verify completion integrity for a single SD.
 * @param {string} sdId - SD UUID
 * @returns {Object} Verification result with overall pass/fail and per-check details
 */
export async function verifyCompletion(sdId) {
  let { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, sd_type, status, scope, key_changes')
    .eq('id', sdId)
    .single();

  if (!sd) {
    // Try by sd_key
    const { data: sdByKey } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, sd_type, status, scope, key_changes')
      .eq('sd_key', sdId)
      .single();
    if (!sdByKey) return { pass: false, error: `SD not found: ${sdId}` };
    // Pre-existing bug fix: the prior `Object.assign(sd || {}, sdByKey)` assigned into a discarded
    // temp object, leaving sd null and crashing on sd.sd_type below. Assign the row directly.
    sd = sdByKey;
  }

  const tierConfig = VERIFICATION_TIERS[sd.sd_type] || VERIFICATION_TIERS.infrastructure;
  const checks = {};
  let totalScore = 0;
  let checkCount = 0;

  const checkFunctions = {
    handoff_chain: () => checkHandoffChain(sd.id),
    pr_evidence: () => checkPREvidence(sd.id, sd.sd_key),
    test_evidence: () => checkTestEvidence(sd.id),
    quality_gate: () => checkQualityGate(sd.id),
  };

  for (const checkName of tierConfig.checks) {
    const fn = checkFunctions[checkName];
    if (fn) {
      checks[checkName] = await fn();
      totalScore += checks[checkName].score;
      checkCount++;
    }
  }

  const overallScore = checkCount > 0 ? Math.round(totalScore / checkCount) : 0;
  const baseOverallPass = Object.values(checks).every(c => c.pass);

  // SD-LEO-INFRA-STRENGTHEN-COMPLETION-DELIVERABLE-001: live-end-state deliverable canary.
  // ADVISORY by default — it does NOT alter baseOverallPass or overallScore (no change to the
  // existing blocking semantics). It records its verdict + routes a durable log on a real failure.
  // Only when LEO_DELIVERABLE_CANARY_ENFORCE=block does a CONFIRMED canary fail flip the overall
  // verdict. Conservative: an inconclusive verdict (no derivable/assessable deliverables) NEVER
  // fails or blocks. Exempt the same types the DB deliverable gate exempts.
  const exemptCanary = ['orchestrator', 'documentation', 'docs'];
  let deliverable_canary = null;
  if (!exemptCanary.includes(sd.sd_type)) {
    try {
      const { analyzeDeliverables } = await import('../gap-detection/analyzers/deliverable-analyzer.js');
      deliverable_canary = await runDeliverableCanary(
        { sd_key: sd.sd_key, scope: sd.scope, key_changes: sd.key_changes },
        { analyzeDeliverables }
      );
    } catch (e) {
      deliverable_canary = { verdict: 'inconclusive', summary: `canary error: ${e?.message || e}`, failed: [], deliverables: [] };
    }
  }
  const canaryEnforced = Boolean(deliverable_canary) && deliverable_canary.verdict === 'fail' && canaryEnforceEnabled();
  const overallPass = baseOverallPass && !canaryEnforced;

  const result = {
    sd_id: sd.id,
    sd_key: sd.sd_key,
    sd_type: sd.sd_type,
    tier: tierConfig.tier,
    pass: overallPass,
    score: overallScore,
    checks,
    deliverable_canary,
    canary_enforced: canaryEnforced,
    verified_at: new Date().toISOString()
  };

  // Store verification result
  await supabase.from('sd_verification_results').insert({
    sd_id: sd.id,
    verification_type: 'completion',
    result: overallPass ? 'pass' : 'fail',
    score: overallScore,
    tier: tierConfig.tier,
    details: result,
    verified_by: 'PCVP_VERIFIER'
  });

  // Log to immutable audit trail
  await supabase.from('pcvp_verification_log').insert({
    sd_id: sd.id,
    sd_key: sd.sd_key,
    event_type: overallPass ? 'completion_verified' : 'completion_blocked',
    event_data: result,
    verification_score: overallScore,
    created_by: 'PCVP_VERIFIER'
  });

  // Route a DURABLE, distinct log on a real deliverable-canary failure so it stays visible even in
  // advisory mode (where overallPass remains true and the event above reads 'completion_verified').
  // Fail-soft: a routing error must never break verification.
  if (deliverable_canary && deliverable_canary.verdict === 'fail') {
    await supabase.from('pcvp_verification_log').insert({
      sd_id: sd.id,
      sd_key: sd.sd_key,
      event_type: canaryEnforced ? 'deliverable_canary_blocked' : 'deliverable_canary_advisory_fail',
      event_data: { verdict: deliverable_canary.verdict, summary: deliverable_canary.summary, failed: deliverable_canary.failed },
      verification_score: 0,
      created_by: 'DELIVERABLE_CANARY'
    }).then(() => {}, () => {});
  }

  return result;
}

/**
 * Get stored verification results for an SD.
 * @param {string} sdId - SD UUID or key
 * @returns {Array} Verification results
 */
export async function getVerificationResults(sdId) {
  const { data, error } = await supabase
    .from('sd_verification_results')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

/**
 * Batch verify multiple SDs.
 * @param {Object} options - { status, limit, sdType }
 * @returns {Object} Batch results summary
 */
export async function runBatchVerification(options = {}) {
  const { status = 'completed', limit = 50, sdType } = options;

  let query = supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type')
    .eq('status', status)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (sdType) query = query.eq('sd_type', sdType);

  const { data: sds, error } = await query;
  if (error) return { error: error.message };

  const results = { total: sds.length, pass: 0, fail: 0, details: [] };

  for (const sd of sds) {
    const result = await verifyCompletion(sd.id);
    if (result.pass) results.pass++;
    else results.fail++;
    results.details.push({
      sd_key: sd.sd_key,
      sd_type: sd.sd_type,
      pass: result.pass,
      score: result.score,
      tier: result.tier
    });
  }

  results.integrity_rate = results.total > 0
    ? Math.round(100 * results.pass / results.total)
    : 0;

  return results;
}
