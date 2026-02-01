/**
 * UAT Result Recorder
 *
 * Purpose: Record UAT test results to database for /uat command
 * SD: SD-UAT-REC-001, SD-LEO-ENH-UAT-DOM-CAPTURE-001
 * SD: SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001 (Pattern Matching Integration)
 *
 * Features:
 * - Start/complete UAT sessions (test runs)
 * - Record individual scenario results (PASS/FAIL/BLOCKED/SKIP)
 * - Calculate quality gate (GREEN/YELLOW/RED)
 * - Store scenario snapshots for traceability
 * - DOM capture support for visual failures (SD-LEO-ENH-UAT-DOM-CAPTURE-001)
 * - Issue pattern matching before creating defects (SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001)
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import { calculatePriority } from '../quality/priority-calculator.js';
import { captureVisualDefect, verifySelector, shouldCaptureDom } from './dom-capture.js';
// SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001: Pattern matching integration
import {
  matchFailure,
  getRCATriggerRecommendation,
  recordPatternOccurrence
} from './issue-pattern-matcher.js';

let supabase = null;

/**
 * Initialize Supabase client
 */
async function getSupabase() {
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }
  return supabase;
}

/**
 * Start a new UAT session (test run)
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Session options
 * @param {string} options.triggeredBy - Who triggered the session (UAT_COMMAND, MANUAL)
 * @param {string} options.executedBy - User executing tests
 * @param {string} options.commitSha - Git commit SHA
 * @param {string} options.buildVersion - Build version
 * @param {Array} options.scenarioSnapshot - Scenarios being tested (frozen at test time)
 * @returns {Promise<Object>} Created test run
 */
export async function startSession(sdId, options = {}) {
  const db = await getSupabase();

  const {
    triggeredBy = 'UAT_COMMAND',
    executedBy = 'CLAUDE',
    commitSha = null,
    buildVersion = null,
    scenarioSnapshot = []
  } = options;

  // Create test run record
  const { data: testRun, error } = await db
    .from('uat_test_runs')
    .insert({
      sd_id: sdId,
      status: 'running',
      triggered_by: triggeredBy,
      executed_by: executedBy,
      commit_sha: commitSha,
      build_version: buildVersion,
      scenario_snapshot: scenarioSnapshot,
      started_at: new Date().toISOString(),
      total: scenarioSnapshot.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      defects_found: 0,
      quick_fixes_created: 0
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to start UAT session:', error.message);
    throw new Error(`Failed to start UAT session: ${error.message}`);
  }

  console.log(`   Started UAT session: ${testRun.id}`);
  return testRun;
}

/**
 * Record a single scenario result
 *
 * @param {string} testRunId - Test run ID
 * @param {Object} scenario - The scenario being tested
 * @param {string} result - PASS, FAIL, BLOCKED, SKIP
 * @param {Object} details - Additional details
 * @param {string} details.notes - Tester notes
 * @param {string} details.errorMessage - Error message if failed
 * @param {string} details.failureType - Type of failure (visual, functional, performance, console)
 * @param {number} details.estimatedLOC - Estimated lines of code to fix
 * @returns {Promise<Object>} Recorded result
 */
export async function recordResult(testRunId, scenario, result, details = {}) {
  const db = await getSupabase();

  const validResults = ['PASS', 'FAIL', 'BLOCKED', 'SKIP'];
  const normalizedResult = result.toUpperCase();

  if (!validResults.includes(normalizedResult)) {
    throw new Error(`Invalid result: ${result}. Must be one of: ${validResults.join(', ')}`);
  }

  const {
    notes = null,
    errorMessage = null,
    failureType = null,
    estimatedLOC = null,
    domCapture = null,
    domCaptureOffered = false,
    domCaptureAccepted = false
  } = details;

  // Create test result record
  const { data: testResult, error } = await db
    .from('uat_test_results')
    .insert({
      test_run_id: testRunId,
      status: normalizedResult.toLowerCase(),
      source_type: scenario.source || 'user_story',
      source_id: scenario.sourceId || null,
      scenario_snapshot: {
        id: scenario.id,
        title: scenario.title,
        given: scenario.given,
        when: scenario.when,
        then: scenario.then,
        priority: scenario.priority
      },
      error_message: errorMessage || notes,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to record result:', error.message);
    throw new Error(`Failed to record result: ${error.message}`);
  }

  // Update test run counts
  await updateRunCounts(testRunId, normalizedResult);

  // If failed with estimated LOC, potentially create defect
  if (normalizedResult === 'FAIL' && errorMessage) {
    await recordDefect(testRunId, scenario, {
      errorMessage,
      failureType,
      estimatedLOC,
      domCapture,
      domCaptureOffered,
      domCaptureAccepted
    });
  }

  return testResult;
}

/**
 * Update test run counts after recording a result
 *
 * @param {string} testRunId - Test run ID
 * @param {string} result - The result that was recorded
 */
async function updateRunCounts(testRunId, result) {
  const db = await getSupabase();

  // Get current counts
  const { data: run, error: fetchError } = await db
    .from('uat_test_runs')
    .select('passed, failed, skipped')
    .eq('id', testRunId)
    .single();

  if (fetchError) return;

  // Calculate new counts
  const updates = {
    passed: run.passed || 0,
    failed: run.failed || 0,
    skipped: run.skipped || 0
  };

  switch (result) {
  case 'PASS':
    updates.passed++;
    break;
  case 'FAIL':
    updates.failed++;
    break;
  case 'BLOCKED':
  case 'SKIP':
    updates.skipped++;
    break;
  }

  await db
    .from('uat_test_runs')
    .update(updates)
    .eq('id', testRunId);
}

/**
 * Record a defect from a failed test
 * SD-QUALITY-INT-001: Also writes to unified feedback table
 * SD-LEO-ENH-UAT-DOM-CAPTURE-001: Includes DOM capture metadata for visual failures
 * SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001: Pattern matching and RCA triggering
 *
 * @param {string} testRunId - Test run ID
 * @param {Object} scenario - The failed scenario
 * @param {Object} details - Defect details
 * @param {Object} details.domCapture - DOM capture metadata (selectors, bounding box, etc.)
 * @param {boolean} details.domCaptureOffered - Whether DOM capture was offered to user
 * @param {boolean} details.domCaptureAccepted - Whether user accepted DOM capture
 * @returns {Promise<Object>} Defect record with pattern match info
 */
async function recordDefect(testRunId, scenario, details) {
  const db = await getSupabase();

  const { errorMessage, failureType, estimatedLOC, domCapture, domCaptureOffered, domCaptureAccepted, routePath } = details;

  // SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001: Match against known patterns first
  let patternMatch = null;
  let rcaRecommendation = null;

  try {
    // Build failure object for pattern matching
    const failure = {
      description: errorMessage,
      failureType: failureType,
      errorMessage: errorMessage,
      routePath: routePath || scenario.routeContext?.path,
      isBlocking: failureType?.includes('blocking'),
      affectsData: failureType?.includes('data'),
      affectsAuth: failureType?.includes('auth'),
      isRegression: scenario.source === 'regression'
    };

    // Match against issue_patterns
    patternMatch = await matchFailure(failure);

    // Get RCA recommendation
    rcaRecommendation = getRCATriggerRecommendation(patternMatch);

    // Log pattern match results
    if (patternMatch.hasMatch) {
      console.log(`   🔍 Pattern match found: ${patternMatch.bestMatch.pattern_id} (${Math.round(patternMatch.bestMatch.similarity * 100)}% similarity)`);

      // Record occurrence against existing pattern
      await recordPatternOccurrence(patternMatch.bestMatch.pattern_id, {
        sdId: scenario.sd_id
      });
    }

    if (rcaRecommendation.shouldTrigger) {
      console.log(`   🔬 RCA recommended: ${rcaRecommendation.reason}`);
    }
  } catch (matchError) {
    console.log(`   ⚠️  Pattern matching unavailable: ${matchError.message}`);
  }

  // SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001: Use deterministic severity classification
  let severity;
  if (patternMatch?.classifiedSeverity) {
    severity = patternMatch.classifiedSeverity;
  } else {
    // Fallback to LOC-based classification
    const severityLevel = estimatedLOC && estimatedLOC <= 50 ? 'minor' : 'major';
    severity = severityLevel === 'major' ? 'high' : 'medium';
  }

  // SD-QUALITY-TRIAGE-001: Use priority-calculator instead of hardcoded mapping
  const preliminaryRecord = {
    type: 'issue',
    severity: severity,
    source_type: 'uat_failure'
  };
  const priorityResult = calculatePriority(preliminaryRecord);

  // SD-QUALITY-INT-001: Write to unified feedback table
  try {
    await db.from('feedback').insert({
      type: 'issue',
      title: `UAT Failure: ${scenario.title}`,
      description: `${errorMessage}\n\n**Scenario Details:**\n- Given: ${scenario.given || 'N/A'}\n- When: ${scenario.when || 'N/A'}\n- Then: ${scenario.then || 'N/A'}`,
      severity: severity,
      priority: priorityResult.priority,
      priority_reasoning: priorityResult.reasoning,
      status: 'new',  // Valid status per schema
      source_type: 'uat_failure',
      source_application: 'EHG_Engineer',
      metadata: {
        test_run_id: testRunId,
        scenario_id: scenario.id,
        scenario_title: scenario.title,
        failure_type: failureType,
        estimated_loc: estimatedLOC,
        source_id: scenario.sourceId,
        source: scenario.source,
        // SD-LEO-ENH-UAT-DOM-CAPTURE-001: DOM capture metadata
        dom_capture_offered: domCaptureOffered,
        dom_capture_accepted: domCaptureAccepted,
        dom_capture: domCapture || null,
        // SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001: Pattern matching metadata
        pattern_match: patternMatch?.hasMatch ? {
          pattern_id: patternMatch.bestMatch.pattern_id,
          similarity: patternMatch.bestMatch.similarity,
          suggested_solutions: patternMatch.suggestedSolutions?.slice(0, 3)
        } : null,
        rca_recommendation: rcaRecommendation?.shouldTrigger ? {
          reason: rcaRecommendation.reason,
          priority: rcaRecommendation.priority,
          prompt: rcaRecommendation.rcaPrompt
        } : null,
        route_context: scenario.routeContext || null
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    console.log('   Recorded UAT failure to feedback table');

    // Update defect count on test run
    const { data: run } = await db
      .from('uat_test_runs')
      .select('defects_found')
      .eq('id', testRunId)
      .single();

    if (run) {
      await db
        .from('uat_test_runs')
        .update({ defects_found: (run.defects_found || 0) + 1 })
        .eq('id', testRunId);
    }
  } catch (feedbackError) {
    // Non-blocking - log but continue
    console.log('   Note: Could not record to feedback table:', feedbackError.message);
  }
  // SD-LEO-INFRA-DEPRECATE-UAT-DEFECTS-001: Removed legacy uat_defects fallback
  // All UAT defects now write exclusively to the unified feedback table
}

/**
 * Complete a UAT session and calculate quality gate
 *
 * @param {string} testRunId - Test run ID
 * @returns {Promise<Object>} Completed test run with quality gate
 */
export async function completeSession(testRunId) {
  const db = await getSupabase();

  // Get final counts
  const { data: run, error: fetchError } = await db
    .from('uat_test_runs')
    .select('*')
    .eq('id', testRunId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch test run: ${fetchError.message}`);
  }

  const total = run.total || 0;
  const passed = run.passed || 0;
  const failed = run.failed || 0;

  // Calculate pass rate
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  // Calculate quality gate
  // GREEN: 0 failures AND pass_rate >= 85%
  // YELLOW: Has failures BUT pass_rate >= 85%
  // RED: pass_rate < 85%
  let qualityGate = 'GREEN';
  if (passRate < 85) {
    qualityGate = 'RED';
  } else if (failed > 0) {
    qualityGate = 'YELLOW';
  }

  // Update test run
  const { data: completedRun, error: updateError } = await db
    .from('uat_test_runs')
    .update({
      status: 'completed',
      quality_gate: qualityGate,
      completed_at: new Date().toISOString()
    })
    .eq('id', testRunId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to complete session: ${updateError.message}`);
  }

  console.log('\n   UAT Session Complete');
  console.log(`   Pass Rate: ${passRate.toFixed(1)}%`);
  console.log(`   Quality Gate: ${qualityGate}`);

  return {
    ...completedRun,
    passRate,
    summary: {
      total,
      passed,
      failed,
      skipped: run.skipped || 0,
      passRate: passRate.toFixed(1),
      qualityGate,
      defectsFound: run.defects_found || 0
    }
  };
}

/**
 * Get UAT session status
 *
 * @param {string} testRunId - Test run ID
 * @returns {Promise<Object>} Session status
 */
export async function getSessionStatus(testRunId) {
  const db = await getSupabase();

  const { data: run, error } = await db
    .from('uat_test_runs')
    .select('*')
    .eq('id', testRunId)
    .single();

  if (error) {
    throw new Error(`Failed to get session: ${error.message}`);
  }

  const total = run.total || 0;
  const completed = (run.passed || 0) + (run.failed || 0) + (run.skipped || 0);

  return {
    id: run.id,
    sdId: run.sd_id,
    status: run.status,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    counts: {
      total,
      completed,
      remaining: total - completed,
      passed: run.passed || 0,
      failed: run.failed || 0,
      skipped: run.skipped || 0
    },
    qualityGate: run.quality_gate || 'PENDING',
    startedAt: run.started_at,
    defectsFound: run.defects_found || 0
  };
}

/**
 * Get latest UAT session for an SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object|null>} Latest test run or null
 */
export async function getLatestSession(sdId) {
  const db = await getSupabase();

  const { data: runs, error } = await db
    .from('uat_test_runs')
    .select('*')
    .eq('sd_id', sdId)
    .order('started_at', { ascending: false })
    .limit(1);

  if (error || !runs || runs.length === 0) {
    return null;
  }

  return runs[0];
}

// Re-export DOM capture functions for convenience
export { captureVisualDefect, verifySelector, shouldCaptureDom };

export default {
  startSession,
  recordResult,
  completeSession,
  getSessionStatus,
  getLatestSession,
  // DOM capture exports
  captureVisualDefect,
  verifySelector,
  shouldCaptureDom
};
