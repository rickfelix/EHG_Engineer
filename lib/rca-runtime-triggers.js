/**
 * RCA Runtime Triggers
 * SD-RCA-001
 *
 * Monitors application events in realtime and automatically creates Root Cause Reports (RCRs)
 * when failures are detected. Supports 4-tier trigger system (T1: Critical, T2: High, T3: Medium, T4: Manual).
 *
 * @module lib/rca-runtime-triggers
 */

import { createSupabaseClient, createSupabaseServiceClient } from './supabase-client.js';
import dotenv from 'dotenv';
import { execute as executeRCA } from './sub-agents/rca.js';

dotenv.config();

/**
 * Sub-Agent Failure Monitor
 * Triggers RCA when sub-agents return FAIL or BLOCKED verdicts
 *
 * @returns {Promise<RealtimeChannel>} Subscription channel
 */
export async function monitorSubAgentFailures() {
  const supabase = createSupabaseClient();

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
  const supabase = createSupabaseClient();

  const subscription = supabase
    .channel('test_results_regression')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'test_results',
        filter: 'status=eq.failed'
      },
      async (payload) => {
        const failure = payload.new;

        // A NULL/empty identity would either be misclassified as "first-ever
        // failure" (silently never triggering) or, via .is(), cross-match every
        // other NULL-title row regardless of which test it belongs to. Skip
        // loudly rather than reintroduce this SD's own defect class on a
        // different column. Confirmed live: 4/52 existing rows are affected.
        if (!failure.test_full_title) {
          console.warn(
            '[rca-runtime-triggers] skipping regression check -- missing test_full_title',
            { id: failure.id }
          );
          return;
        }

        // Regression check is RUN-RELATIVE, not wall-clock: real test_runs are
        // 8-24 days apart (confirmed live), so a 24h window would silently
        // discard nearly every real regression. Compare against the same test's
        // result from the most recent EARLIER test_run (never the current run,
        // which excludes same-run Playwright retries).
        const { data: priorResults, error: resultsError } = await supabase
          .from('test_results')
          .select('status, test_run_id')
          .eq('test_full_title', failure.test_full_title)
          .neq('test_run_id', failure.test_run_id);

        if (resultsError) {
          console.warn(
            '[rca-runtime-triggers] regression lookback query failed -- skipping',
            { id: failure.id, error: resultsError }
          );
          return;
        }
        if (!priorResults?.length) {
          return;
        }

        const priorRunIds = [...new Set(priorResults.map((r) => r.test_run_id))];

        // Two existing test_runs share an identical started_at timestamp, so a
        // single-column ORDER BY is non-deterministic -- id is the tiebreaker.
        const { data: priorRuns, error: runsError } = await supabase
          .from('test_runs')
          .select('id, started_at, sd_id')
          .in('id', priorRunIds)
          .order('started_at', { ascending: false })
          .order('id', { ascending: false });

        if (runsError) {
          console.warn(
            '[rca-runtime-triggers] test_runs lookup failed -- skipping',
            { id: failure.id, error: runsError }
          );
          return;
        }
        if (!priorRuns?.length) {
          return;
        }

        const mostRecentRun = priorRuns[0];
        const mostRecentResult = priorResults.find((r) => r.test_run_id === mostRecentRun.id);

        if (!mostRecentResult || mostRecentResult.status !== 'passed') {
          return;
        }

        const sd_id = mostRecentRun.sd_id ?? null;

        // T2 trigger: regression (was passing on an earlier run, now failing)
        await triggerRCA({
          scope_type: 'PIPELINE',
          scope_id: failure.id,
          sd_id,
          trigger_source: 'TEST_FAILURE',
          trigger_tier: 2,
          failure_signature: `test_regression:${failure.test_full_title}:${sd_id ?? 'unknown'}`,
          problem_statement: `Test "${failure.test_full_title}" regressed (was passing in an earlier run, ${mostRecentRun.id})`,
          observed: {
            test_name: failure.test_full_title,
            status: 'failed',
            error_message: failure.error_message,
            stack_trace: failure.error_stack
          },
          expected: {
            status: 'passed',
            prior_run_id: mostRecentRun.id
          },
          evidence_refs: {
            test_failure_id: failure.id,
            stack_trace: failure.error_stack,
            screenshot_url: failure.failure_screenshot_path
          },
          impact_level: 'HIGH',
          likelihood_level: 'FREQUENT'
        });
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
  const supabase = createSupabaseClient();

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
  const supabase = createSupabaseClient();

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
 * @returns {Promise<string|null>} RCR ID, or null if the diagnostic write failed.
 *
 * NEVER REJECTS. QF-20260726-175: this function threw on any Supabase error, and all six call
 * sites are `await triggerRCA(...)` inside Supabase REALTIME SUBSCRIPTION CALLBACKS. An async
 * callback that throws produces an unhandled rejection, and under Node's default
 * --unhandled-rejections=throw that TERMINATES THE PROCESS. On 2026-07-26 an RLS denial here
 * (code 42501 inserting into root_cause_reports) killed the entire API server for 1h45m; port
 * 8080 stayed up so the app looked alive, and the chairman's page was dead the whole time.
 *
 * The asymmetry is the point: THIS IS A DIAGNOSTIC SIDE-WRITE. It exists to record why something
 * else broke. It must never be able to break the thing it is observing. So every failure degrades
 * to a loud log line and a null return.
 *
 * Fail-soft is safe for the return value specifically because no call site consumes it — all six
 * are fire-and-forget (lines 41, 70, 138, 198, 227, 290). Verified before making this change; a
 * future caller that needs the id must handle null rather than assume a string.
 */
async function triggerRCA(params) {
  try {
    return await triggerRCAOrThrow(params);
  } catch (err) {
    // Loud, not silent: an RCR that failed to record is a real loss of diagnostic coverage, and
    // the QF is explicit that silently dropping RCRs is the same class of invisible failure as
    // the crash. It just must not be a FATAL loss.
    console.error(
      '[rca-runtime-triggers] RCR NOT RECORDED — diagnostic write failed, continuing anyway. '
      + `signature=${params?.failure_signature ?? '<none>'} code=${err?.code ?? '<none>'} `
      + `message=${err?.message ?? String(err)}`,
    );
    return null;
  }
}

/**
 * The original body, unchanged in behaviour. Kept as a separate throwing function so the happy
 * path and its error semantics stay readable, and so a caller that genuinely wants the throw can
 * still reach it deliberately rather than by accident.
 */
async function triggerRCAOrThrow(params) {
  // Service-role, not anon: this is a server-only diagnostic side-write (this
  // file is only ever imported by lib/rca-monitor-bootstrap.js, invoked from
  // server/index.js at startup -- never reachable from browser/client code).
  // Confirmed live: an anon insert into root_cause_reports returns 42501 (RLS
  // policy violation), which the fail-soft wrapper below silently swallows --
  // the same error code as the QF-20260726-175 incident. Scoped to this one
  // shared helper; the 4 monitors' own realtime-subscription clients (used for
  // read-only .channel()/.on() calls, gated by an already-permissive SELECT
  // policy) are untouched.
  const supabase = createSupabaseServiceClient();

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
 * v1.1: Full forensic analysis with 5 Whys, causal chain, pattern matching
 *
 * @param {string} rcrId - RCR ID
 * @returns {Promise<Object>} RCA analysis results
 */
async function invokeRCASubAgent(rcrId) {
  console.log(`🔬 Invoking RCA sub-agent for forensic analysis of RCR ${rcrId}...`);

  try {
    // Execute the RCA sub-agent with the RCR ID
    const results = await executeRCA(rcrId, { code: 'RCA', name: 'Root Cause Analysis' }, {
      skipLearning: false  // Create learning records by default
    });

    console.log(`✅ RCA sub-agent completed: ${results.verdict} (${results.confidence}% confidence)`);

    if (results.recommendations?.length > 0) {
      console.log(`   Recommendations: ${results.recommendations.length}`);
    }

    return results;
  } catch (error) {
    console.error(`❌ RCA sub-agent execution failed: ${error.message}`);
    return {
      verdict: 'ERROR',
      error: error.message,
      rcr_id: rcrId
    };
  }
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
