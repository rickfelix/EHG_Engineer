/**
 * RCA Runtime Triggers
 * SD-RCA-001
 *
 * Monitors application events in realtime and automatically creates Root Cause Reports (RCRs)
 * when failures are detected. Supports 4-tier trigger system (T1: Critical, T2: High, T3: Medium, T4: Manual).
 *
 * @module lib/rca-runtime-triggers
 */

import { createDatabaseClient } from './supabase-connection.js';

/**
 * Sub-Agent Failure Monitor
 * Triggers RCA when sub-agents return FAIL or BLOCKED verdicts
 *
 * @returns {Promise<RealtimeChannel>} Subscription channel
 */
export async function monitorSubAgentFailures() {
  const supabase = createDatabaseClient();

  const subscription = supabase
    .channel('sub_agent_failures')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sub_agent_execution_results',
        filter: 'verdict=in.(FAIL,BLOCKED)'
      },
      async (payload) => {
        const result = payload.new;

        // T1 trigger: BLOCKED with high confidence
        if (result.verdict === 'BLOCKED' && result.confidence >= 90) {
          await triggerRCA({
            scope_type: 'SUB_AGENT',
            scope_id: result.id,
            sd_id: result.sd_id,
            trigger_source: 'SUB_AGENT',
            trigger_tier: 1,
            failure_signature: `sub_agent_blocked:${result.sub_agent_code}:${result.sd_id}`,
            problem_statement: `Sub-agent ${result.sub_agent_name} returned BLOCKED verdict`,
            observed: {
              sub_agent: result.sub_agent_name,
              verdict: result.verdict,
              confidence: result.confidence,
              critical_issues: result.critical_issues
            },
            expected: {
              verdict: 'PASS',
              critical_issues: []
            },
            evidence_refs: {
              sub_agent_result_id: result.id,
              detailed_analysis: result.detailed_analysis
            },
            impact_level: 'CRITICAL',
            likelihood_level: 'FREQUENT'
          });
        }

        // T2 trigger: FAIL with confidence >= 80
        else if (result.verdict === 'FAIL' && result.confidence >= 80) {
          await triggerRCA({
            scope_type: 'SUB_AGENT',
            scope_id: result.id,
            sd_id: result.sd_id,
            trigger_source: 'SUB_AGENT',
            trigger_tier: 2,
            failure_signature: `sub_agent_fail:${result.sub_agent_code}:${result.sd_id}`,
            problem_statement: `Sub-agent ${result.sub_agent_name} returned FAIL verdict`,
            observed: {
              sub_agent: result.sub_agent_name,
              verdict: result.verdict,
              confidence: result.confidence,
              critical_issues: result.critical_issues,
              warnings: result.warnings
            },
            expected: {
              verdict: 'PASS',
              critical_issues: [],
              warnings: []
            },
            evidence_refs: {
              sub_agent_result_id: result.id,
              detailed_analysis: result.detailed_analysis
            },
            impact_level: 'HIGH',
            likelihood_level: 'OCCASIONAL'
          });
        }
      }
    )
    .subscribe();

  return subscription;
}

/**
 * Test Failure Monitor
 * Triggers RCA when tests fail, especially regressions
 *
 * @returns {Promise<RealtimeChannel>} Subscription channel
 */
export async function monitorTestFailures() {
  const supabase = createDatabaseClient();

  const subscription = supabase
    .channel('test_failures')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'test_failures'
      },
      async (payload) => {
        const failure = payload.new;

        // Check if this is a regression (was passing recently)
        const { data: recentPasses, error } = await supabase
          .from('playwright_test_scenarios')
          .select('last_run_status, last_run_at')
          .eq('id', failure.test_scenario_id)
          .maybeSingle();

        if (!error && recentPasses?.last_run_status === 'passed') {
          const hoursSincePass = (Date.now() - new Date(recentPasses.last_run_at).getTime()) / (1000 * 60 * 60);

          // T2 trigger: Regression within 24 hours
          if (hoursSincePass <= 24) {
            await triggerRCA({
              scope_type: 'PIPELINE',
              scope_id: failure.id,
              sd_id: failure.sd_id,
              trigger_source: 'TEST_FAILURE',
              trigger_tier: 2,
              failure_signature: `test_regression:${failure.test_name}:${failure.sd_id}`,
              problem_statement: `Test "${failure.test_name}" regressed (was passing ${hoursSincePass.toFixed(1)}h ago)`,
              observed: {
                test_name: failure.test_name,
                status: 'failed',
                error_message: failure.error_message,
                stack_trace: failure.stack_trace,
                regression_hours: hoursSincePass
              },
              expected: {
                status: 'passed',
                last_pass_at: recentPasses.last_run_at
              },
              evidence_refs: {
                test_failure_id: failure.id,
                stack_trace: failure.stack_trace,
                screenshot_url: failure.screenshot_url
              },
              impact_level: 'HIGH',
              likelihood_level: 'FREQUENT'
            });
          }
        }
      }
    )
    .subscribe();

  return subscription;
}

/**
 * Quality Gate Monitor
 * Triggers RCA when quality scores drop below thresholds
 *
 * @returns {Promise<RealtimeChannel>} Subscription channel
 */
export async function monitorQualityGates() {
  const supabase = createDatabaseClient();

  const subscription = supabase
    .channel('quality_degradation')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'retrospectives'
      },
      async (payload) => {
        const oldRecord = payload.old;
        const newRecord = payload.new;

        // T1 trigger: Quality score drops below 70
        if (newRecord.quality_score < 70 && oldRecord.quality_score >= 70) {
          await triggerRCA({
            scope_type: 'SD',
            scope_id: newRecord.sd_id,
            sd_id: newRecord.sd_id,
            trigger_source: 'QUALITY_GATE',
            trigger_tier: 1,
            failure_signature: `quality_critical:${newRecord.sd_id}`,
            problem_statement: `Quality score dropped below critical threshold (${newRecord.quality_score}/100)`,
            observed: {
              quality_score: newRecord.quality_score,
              previous_score: oldRecord.quality_score,
              drop: oldRecord.quality_score - newRecord.quality_score
            },
            expected: {
              quality_score: '>=70',
              threshold: 70
            },
            evidence_refs: {
              retrospective_id: newRecord.id,
              key_learnings: newRecord.key_learnings,
              action_items: newRecord.action_items
            },
            impact_level: 'CRITICAL',
            likelihood_level: 'OCCASIONAL'
          });
        }

        // T3 trigger: Quality score drops by 15+ points
        else if (oldRecord.quality_score - newRecord.quality_score >= 15) {
          await triggerRCA({
            scope_type: 'SD',
            scope_id: newRecord.sd_id,
            sd_id: newRecord.sd_id,
            trigger_source: 'QUALITY_GATE',
            trigger_tier: 3,
            failure_signature: `quality_degradation:${newRecord.sd_id}`,
            problem_statement: `Quality score degraded by ${oldRecord.quality_score - newRecord.quality_score} points`,
            observed: {
              quality_score: newRecord.quality_score,
              previous_score: oldRecord.quality_score,
              drop: oldRecord.quality_score - newRecord.quality_score
            },
            expected: {
              score_degradation: '<15 points',
              baseline: oldRecord.quality_score
            },
            evidence_refs: {
              retrospective_id: newRecord.id
            },
            impact_level: 'MEDIUM',
            likelihood_level: 'RARE'
          });
        }
      }
    )
    .subscribe();

  return subscription;
}

/**
 * Handoff Rejection Monitor
 * Triggers RCA when handoffs are rejected, especially repeat rejections
 *
 * @returns {Promise<RealtimeChannel>} Subscription channel
 */
export async function monitorHandoffRejections() {
  const supabase = createDatabaseClient();

  const subscription = supabase
    .channel('handoff_rejections')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sd_phase_handoffs',
        filter: 'status=eq.rejected'
      },
      async (payload) => {
        const handoff = payload.new;

        // Check rejection count for this SD + handoff type
        const { data: rejectionHistory, error } = await supabase
          .from('sd_phase_handoffs')
          .select('id, status, rejection_reason')
          .eq('sd_id', handoff.sd_id)
          .eq('handoff_type', handoff.handoff_type)
          .eq('status', 'rejected');

        // T2 trigger: 2nd rejection for same handoff type
        if (!error && rejectionHistory.length >= 2) {
          await triggerRCA({
            scope_type: 'SD',
            scope_id: handoff.sd_id,
            sd_id: handoff.sd_id,
            trigger_source: 'HANDOFF_REJECTION',
            trigger_tier: 2,
            failure_signature: `handoff_rejected:${handoff.handoff_type}:${handoff.sd_id}`,
            problem_statement: `${handoff.handoff_type} handoff rejected ${rejectionHistory.length} times`,
            observed: {
              handoff_type: handoff.handoff_type,
              rejection_count: rejectionHistory.length,
              rejection_reasons: rejectionHistory.map(r => r.rejection_reason),
              from_phase: handoff.from_phase,
              to_phase: handoff.to_phase
            },
            expected: {
              rejection_count: 0,
              status: 'accepted'
            },
            evidence_refs: {
              handoff_ids: rejectionHistory.map(r => r.id),
              latest_rejection_reason: handoff.rejection_reason
            },
            impact_level: 'HIGH',
            likelihood_level: 'OCCASIONAL'
          });
        }
      }
    )
    .subscribe();

  return subscription;
}

/**
 * Core RCA Trigger Function
 * Creates a root_cause_report record with initial investigation
 *
 * @param {Object} params - RCR parameters
 * @param {string} params.scope_type - Scope type (SD, PRD, PIPELINE, etc.)
 * @param {string} params.scope_id - Scope identifier
 * @param {string} params.sd_id - Strategic Directive ID
 * @param {string} params.trigger_source - Trigger source
 * @param {number} params.trigger_tier - Tier (1-4)
 * @param {string} params.failure_signature - Unique signature for deduplication
 * @param {string} params.problem_statement - Problem description
 * @param {Object} params.observed - Observed state
 * @param {Object} params.expected - Expected state
 * @param {Object} params.evidence_refs - Evidence references
 * @param {string} params.impact_level - Impact level (CRITICAL, HIGH, MEDIUM, LOW)
 * @param {string} params.likelihood_level - Likelihood level
 * @returns {Promise<string>} RCR ID
 */
async function triggerRCA(params) {
  const supabase = createDatabaseClient();

  // Check for duplicate RCR with same failure signature
  const { data: existingRCR } = await supabase
    .from('root_cause_reports')
    .select('id, status, recurrence_count')
    .eq('failure_signature', params.failure_signature)
    .in('status', ['OPEN', 'IN_REVIEW'])
    .maybeSingle();

  if (existingRCR) {
    // Update recurrence count instead of creating duplicate
    await supabase
      .from('root_cause_reports')
      .update({
        recurrence_count: existingRCR.recurrence_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingRCR.id);

    console.log(`RCA duplicate detected: Updated recurrence count for RCR ${existingRCR.id}`);
    return existingRCR.id;
  }

  // Calculate initial confidence score
  const confidence = calculateConfidence(params);

  // Create new RCR
  const { data: rcr, error } = await supabase
    .from('root_cause_reports')
    .insert({
      scope_type: params.scope_type,
      scope_id: params.scope_id,
      sd_id: params.sd_id,
      trigger_source: params.trigger_source,
      trigger_tier: params.trigger_tier,
      failure_signature: params.failure_signature,
      problem_statement: params.problem_statement,
      observed: params.observed,
      expected: params.expected,
      evidence_refs: params.evidence_refs,
      confidence: confidence,
      impact_level: params.impact_level,
      likelihood_level: params.likelihood_level,
      status: 'OPEN',
      log_quality: params.evidence_refs?.stack_trace ? 20 : 10,
      evidence_strength: 10, // Will be updated by forensic analysis
      pattern_match_score: 0, // Will be updated by pattern matching
      historical_success_bonus: 0,
      metadata: {
        auto_triggered: true,
        trigger_timestamp: new Date().toISOString()
      }
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create RCR:', error);
    throw error;
  }

  console.log(`✅ RCA Triggered: Created RCR ${rcr.id} (${params.failure_signature})`);

  // Invoke RCA sub-agent for detailed analysis (v1.1)
  await invokeRCASubAgent(rcr.id);

  return rcr.id;
}

/**
 * Calculate initial confidence score
 * Formula: BASE(40) + log_quality(20) + evidence_strength(20) + pattern_match(15) + historical_success(5)
 *
 * @param {Object} params - RCR parameters
 * @returns {number} Confidence score (0-100)
 */
function calculateConfidence(params) {
  let confidence = 40; // BASE

  // Log quality (0-20)
  if (params.evidence_refs?.stack_trace) {
    confidence += 20;
  } else if (params.evidence_refs?.error_message) {
    confidence += 10;
  }

  // Evidence strength (initial estimate: 10)
  confidence += 10;

  return Math.min(confidence, 100);
}

/**
 * Invoke RCA sub-agent for full forensic analysis
 * v1: Stub implementation
 * v1.1: Full forensic analysis with 5 Whys, causal chain, pattern matching
 *
 * @param {string} rcrId - RCR ID
 */
async function invokeRCASubAgent(rcrId) {
  // v1: Log that sub-agent should be invoked
  console.log(`TODO (v1.1): Invoke RCA sub-agent for full analysis of RCR ${rcrId}`);

  // v1.1: Execute full forensic analysis
  // const { exec } = require('child_process');
  // exec(`node scripts/root-cause-agent.js analyze --rcr-id ${rcrId}`, (error, stdout, stderr) => {
  //   if (error) {
  //     console.error(`RCA sub-agent execution failed: ${error}`);
  //     return;
  //   }
  //   console.log(`RCA sub-agent analysis complete: ${stdout}`);
  // });
}

/**
 * Initialize all runtime monitors
 * Starts all RCA monitoring subscriptions
 *
 * @returns {Promise<Array<RealtimeChannel>>} Array of subscription channels
 */
export async function initializeRCAMonitoring() {
  console.log('Initializing RCA runtime monitoring...');

  const subscriptions = await Promise.all([
    monitorSubAgentFailures(),
    monitorTestFailures(),
    monitorQualityGates(),
    monitorHandoffRejections()
  ]);

  console.log('✅ RCA monitoring active (4 triggers)');

  return subscriptions;
}

/**
 * Cleanup all subscriptions
 * Stops all RCA monitoring
 *
 * @param {Array<RealtimeChannel>} subscriptions - Subscriptions to cleanup
 */
export async function cleanupRCAMonitoring(subscriptions) {
  for (const sub of subscriptions) {
    await sub.unsubscribe();
  }
  console.log('RCA monitoring stopped');
}

// Export triggerRCA for testing and manual invocation
export { triggerRCA };
