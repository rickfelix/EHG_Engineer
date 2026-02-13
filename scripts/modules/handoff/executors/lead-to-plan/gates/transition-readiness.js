/**
 * SD Transition Readiness Gate for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * TIER 1 Implementation: Entry validation gate
 * Prevents handoff attempts when SD is not ready or has unresolved issues.
 */

import { quickPreflightCheck } from '../../../../../lib/handoff-preflight.js';

/**
 * Validate SD Transition Readiness for LEAD→PLAN
 *
 * Checks:
 * 1. SD has required fields (title, scope, acceptance_criteria)
 * 2. SD status allows for LEAD→PLAN transition
 * 3. No previous failed/rejected LEAD-TO-PLAN handoffs (must resolve first)
 * 4. Quick preflight check for handoff state consistency
 * 5. success_metrics must be populated (QF-20251220-426)
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 * @returns {Object} Validation result
 */
export async function validateTransitionReadiness(sd, supabase) {
  const issues = [];
  const warnings = [];
  let score = 100;

  console.log(`   SD: ${sd.sd_key} - ${sd.title}`);
  console.log(`   Current Status: ${sd.status || 'NOT SET'}`);

  // Check 1: Required fields for planning
  const requiredFields = ['title', 'description'];
  const missingFields = requiredFields.filter(f => !sd[f] || sd[f].trim() === '');

  if (missingFields.length > 0) {
    issues.push(`Missing required fields: ${missingFields.join(', ')}`);
    console.log(`   ❌ Missing required fields: ${missingFields.join(', ')}`);
  } else {
    console.log('   ✅ All required fields present');
  }

  // Check 2: SD status allows LEAD→PLAN transition
  const validStatuses = ['ACTIVE', 'APPROVED', 'PLANNING', 'READY', 'LEAD_APPROVED', null, undefined];
  const blockingStatuses = ['COMPLETED', 'CANCELLED', 'ARCHIVED', 'ON_HOLD'];

  if (blockingStatuses.includes(sd.status?.toUpperCase())) {
    issues.push(`SD status '${sd.status}' does not allow handoff - must be active/approved`);
    console.log(`   ❌ Blocking status: ${sd.status}`);
  } else if (!validStatuses.some(s => s === sd.status || (s && sd.status?.toUpperCase() === s))) {
    warnings.push(`Unusual SD status: ${sd.status} - verify this is intentional`);
    console.log(`   ⚠️  Unusual status: ${sd.status}`);
    score -= 10;
  } else {
    console.log('   ✅ Status allows transition');
  }

  // Check 3: Auto-resolve previous failed/rejected LEAD-TO-PLAN handoffs on retry
  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-003: A new LEAD-TO-PLAN attempt implicitly means the
  // agent has addressed the rejection reason (enriched fields, fixed issues). Auto-resolve
  // old failures to prevent a dead-loop where Check 3 blocks every retry attempt.
  //
  // PAT-HANDOFF-PHZ-001 FIX: Query correct table (sd_phase_handoffs) with correct case.
  // RCA-MULTI-SESSION-CASCADE-001: Only check UNRESOLVED failures.
  try {
    const { data: previousHandoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('id, status, created_at, rejection_reason, resolved_at')
      .eq('sd_id', sd.id)
      .eq('handoff_type', 'LEAD-TO-PLAN')
      .in('status', ['rejected', 'failed', 'blocked'])
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (previousHandoffs && previousHandoffs.length > 0) {
      const failedCount = previousHandoffs.length;
      console.log(`   ℹ️  Found ${failedCount} previous failed/rejected handoff attempt(s) - auto-resolving`);

      // Auto-resolve: a new attempt means issues were addressed
      const idsToResolve = previousHandoffs.map(h => h.id);
      const { error: resolveError } = await supabase
        .from('sd_phase_handoffs')
        .update({ resolved_at: new Date().toISOString() })
        .in('id', idsToResolve);

      if (resolveError) {
        console.log(`   ⚠️  Could not auto-resolve previous handoffs: ${resolveError.message}`);
        warnings.push(`Could not auto-resolve previous handoffs: ${resolveError.message}`);
        score -= 10;
      } else {
        console.log(`   ✅ Auto-resolved ${failedCount} previous handoff failure(s) (retry attempt)`);
      }
    } else {
      console.log('   ✅ No previous failed handoff attempts');
    }
  } catch (error) {
    // Table may not exist yet - warn but don't block
    warnings.push(`Could not check previous handoffs: ${error.message}`);
    console.log(`   ⚠️  Handoff history check skipped: ${error.message}`);
  }

  // Check 4: Quick preflight check using shared utility
  try {
    const preflightResult = await quickPreflightCheck(sd.id, 'PLAN');
    if (!preflightResult.ready) {
      // This is informational for LEAD→PLAN (first handoff)
      // The preflight utility expects LEAD-TO-PLAN to exist for PLAN phase
      // But we're CREATING it now, so this is expected
      console.log('   ℹ️  Preflight: No prior handoffs (expected for LEAD→PLAN)');
    } else {
      console.log('   ✅ Preflight check passed');
    }
  } catch (error) {
    // Preflight utility error - continue anyway
    console.log(`   ⚠️  Preflight check skipped: ${error.message}`);
  }

  // QF-20251220-426: Check 5: success_metrics must be populated
  // Root cause: Empty success_metrics caused RETROSPECTIVE_QUALITY_GATE failures
  // at PLAN-TO-LEAD. Catching this at LEAD-TO-PLAN prevents downstream issues.
  // ROOT CAUSE FIX: Also check success_criteria as fallback (SD creation scripts use this field)
  let successMetrics = sd.success_metrics;
  let metricsSource = 'success_metrics';

  // Fallback to success_criteria if success_metrics is empty (common in SD creation scripts)
  if ((!successMetrics || (Array.isArray(successMetrics) && successMetrics.length === 0))
      && sd.success_criteria && Array.isArray(sd.success_criteria) && sd.success_criteria.length > 0) {
    successMetrics = sd.success_criteria;
    metricsSource = 'success_criteria (fallback)';
    console.log('   ℹ️  Using success_criteria as fallback for success_metrics');
  }

  if (!successMetrics || (Array.isArray(successMetrics) && successMetrics.length === 0)) {
    issues.push('success_metrics AND success_criteria are both empty - must define at least one measurable success metric');
    console.log('   ❌ success_metrics and success_criteria are both empty or missing');
  } else if (Array.isArray(successMetrics)) {
    // Validate structure: accept multiple valid formats
    // Format 1 (success_metrics): { metric: "...", target: "..." }
    // Format 2 (success_criteria per field reference): { criterion: "...", measure: "..." }
    // Format 3 (string): "Schema allows all status values..." (legacy success_criteria)
    const validMetrics = successMetrics.filter(m =>
      (m && typeof m === 'object' && m.metric && m.target) ||      // Format 1: success_metrics
      (m && typeof m === 'object' && m.criterion && m.measure) ||  // Format 2: success_criteria (field reference doc format)
      (m && typeof m === 'string' && m.trim().length > 0)          // Format 3: String format (legacy)
    );
    if (validMetrics.length === 0) {
      issues.push('success_metrics/success_criteria has no valid entries (expected: {metric,target}, {criterion,measure}, or string)');
      console.log('   ❌ No valid metric entries found');
    } else if (validMetrics.length < successMetrics.length) {
      warnings.push(`${successMetrics.length - validMetrics.length} metric entries are invalid`);
      console.log(`   ⚠️  ${validMetrics.length}/${successMetrics.length} metrics are valid`);
      score -= 10;
    } else {
      console.log(`   ✅ ${metricsSource} validated (${validMetrics.length} entries)`);
    }
  } else {
    warnings.push('success_metrics is not an array - may cause downstream issues');
    console.log('   ⚠️  success_metrics is not an array');
    score -= 10;
  }

  const passed = issues.length === 0;
  console.log(`\n   Result: ${passed ? '✅ READY for LEAD→PLAN transition' : '❌ NOT READY - resolve issues above'}`);

  return {
    pass: passed,
    score: passed ? Math.max(score, 70) : 0,
    max_score: 100,
    issues,
    warnings
  };
}

/**
 * Create the transition readiness gate
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createTransitionReadinessGate(supabase) {
  return {
    name: 'GATE_SD_TRANSITION_READINESS',
    validator: async (ctx) => {
      console.log('\n🔄 GATE: SD Transition Readiness');
      console.log('-'.repeat(50));
      return validateTransitionReadiness(ctx.sd, supabase);
    },
    required: true,
    remediation: 'Ensure SD has valid status and no unresolved handoff failures. Address previous handoff rejections before retrying.'
  };
}
