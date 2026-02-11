/**
 * Root Cause Classifier
 *
 * Rule-based classification of gap root causes using gap metadata,
 * handoff history, and PRD revision data.
 *
 * Categories:
 * - prd_omission: Requirement not in any PRD version
 * - scope_creep: Requirement added after PLAN-TO-EXEC
 * - technical_blocker: Handoff rejection mentioning technical issue
 * - dependency_gap: Requirement references external system
 * - protocol_bypass: SD has bypass handoffs
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const DEPENDENCY_KEYWORDS = [
  'external', 'api', 'third-party', 'integration', 'webhook',
  'upstream', 'downstream', 'service', 'endpoint', 'oauth',
  'payment', 'email', 'sms', 'notification'
];

const TECHNICAL_KEYWORDS = [
  'technical', 'infrastructure', 'performance', 'scaling',
  'memory', 'timeout', 'connection', 'database', 'migration'
];

/**
 * Classify root causes for all gaps in an analysis.
 * @param {Array} gaps - Gap findings from gap-detection-engine
 * @param {string} sdKey - The SD key for handoff history lookup
 * @returns {Promise<Array>} Gaps with root_cause_category populated
 */
export async function classifyRootCauses(gaps, sdKey) {
  if (!gaps || gaps.length === 0) return [];

  const sb = getSupabase();

  // Fetch handoff history for this SD
  const { data: handoffs } = await sb
    .from('sd_phase_handoffs')
    .select('handoff_type, status, metadata, rejection_reason, created_by, created_at')
    .eq('sd_id', sdKey)
    .order('created_at', { ascending: true });

  const handoffContext = analyzeHandoffs(handoffs || []);

  return gaps.map(gap => ({
    ...gap,
    root_cause_category: classifySingleGap(gap, handoffContext)
  }));
}

function classifySingleGap(gap, handoffContext) {
  // Rule 5: Protocol bypass (highest priority - systemic issue)
  if (handoffContext.hasBypass) {
    return 'protocol_bypass';
  }

  // Rule 2: Scope creep (requirement added late)
  if (handoffContext.hasPostExecChanges && gap.confidence > 0) {
    return 'scope_creep';
  }

  // Rule 3: Technical blocker (handoff rejection with technical reasons)
  if (handoffContext.hasTechnicalRejection) {
    const reqText = `${gap.requirement} ${gap.evidence}`.toLowerCase();
    for (const kw of TECHNICAL_KEYWORDS) {
      if (reqText.includes(kw)) return 'technical_blocker';
    }
  }

  // Rule 4: Dependency gap (requirement references external systems)
  const reqText = `${gap.requirement} ${gap.evidence}`.toLowerCase();
  for (const kw of DEPENDENCY_KEYWORDS) {
    if (reqText.includes(kw)) return 'dependency_gap';
  }

  // Rule 1: PRD omission (default - requirement was in scope but not delivered)
  return 'prd_omission';
}

function analyzeHandoffs(handoffs) {
  let hasBypass = false;
  let hasTechnicalRejection = false;
  let hasPostExecChanges = false;
  let planToExecTime = null;

  for (const h of handoffs) {
    // Check for bypass handoffs
    if (h.created_by && h.created_by !== 'UNIFIED-HANDOFF-SYSTEM') {
      hasBypass = true;
    }
    if (h.metadata?.bypass_reason) {
      hasBypass = true;
    }

    // Track PLAN-TO-EXEC timing
    if (h.handoff_type === 'PLAN-TO-EXEC' && h.status === 'accepted') {
      planToExecTime = new Date(h.created_at);
    }

    // Check for technical rejections
    if (h.status === 'rejected' && h.rejection_reason) {
      const reason = h.rejection_reason.toLowerCase();
      if (TECHNICAL_KEYWORDS.some(kw => reason.includes(kw))) {
        hasTechnicalRejection = true;
      }
    }

    // Check for post-EXEC handoffs (scope changes)
    if (planToExecTime && h.handoff_type === 'PLAN-TO-EXEC' &&
        new Date(h.created_at) > planToExecTime) {
      hasPostExecChanges = true;
    }
  }

  return { hasBypass, hasTechnicalRejection, hasPostExecChanges };
}
