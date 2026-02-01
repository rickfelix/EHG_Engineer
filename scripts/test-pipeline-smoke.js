#!/usr/bin/env node
/**
 * Pipeline End-to-End Smoke Test
 * SD-LEO-SELF-IMPROVE-001L - Phase 7a: Data-Plane Integration
 *
 * FR-7: End-to-end smoke test that:
 * - Submits feedback and verifies event trace through pipeline
 * - Tests idempotency by re-invoking workers
 * - Outputs per-stage latency summary
 *
 * Usage:
 *   node scripts/test-pipeline-smoke.js
 *   npm run test:pipeline:smoke
 *
 * @module scripts/test-pipeline-smoke
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { processFeedbackEndToEnd, getPipelineTrace, getPipelineHealth } from '../lib/data-plane/pipeline.js';
import { FeedbackToProposalWorker } from '../lib/data-plane/workers/feedback-to-proposal.js';
import { EVENT_TYPES } from '../lib/data-plane/events.js';

// Test configuration
const TEST_TIMEOUT_MS = 60000; // 60 seconds
const LATENCY_THRESHOLD_MS = 500;

// Colors for console output
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logSection(title) {
  console.log('');
  log('═'.repeat(60), COLORS.cyan);
  log(` ${title}`, COLORS.cyan);
  log('═'.repeat(60), COLORS.cyan);
}

function logResult(label, passed, details = '') {
  const status = passed ? `${COLORS.green}✓ PASS${COLORS.reset}` : `${COLORS.red}✗ FAIL${COLORS.reset}`;
  console.log(`  ${status} ${label}${details ? ` (${details})` : ''}`);
  return passed;
}

/**
 * Create Supabase client
 */
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Generate test feedback data
 */
function generateTestFeedback() {
  const testId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: crypto.randomUUID(),
    title: `[SMOKE TEST] Pipeline verification ${testId}`,
    description: 'Automated smoke test for data-plane pipeline integration.',
    type: 'suggestion',
    priority: 'medium',
    status: 'new',
    source_type: 'smoke_test',
    metadata: {
      test_id: testId,
      test_type: 'pipeline_smoke',
      created_at: new Date().toISOString()
    },
    created_at: new Date().toISOString()
  };
}

/**
 * Run the smoke test
 */
async function runSmokeTest() {
  const supabase = getSupabase();
  const results = {
    passed: true,
    tests: [],
    latencies: {},
    trace: null
  };

  const startTime = Date.now();

  try {
    // =========================================================================
    // Test 1: Process feedback through entire pipeline
    // =========================================================================
    logSection('Test 1: End-to-End Pipeline Processing');

    const testFeedback = generateTestFeedback();
    log(`  Creating test feedback: ${testFeedback.id}`, COLORS.gray);
    log(`  Title: ${testFeedback.title}`, COLORS.gray);

    const pipelineResult = await processFeedbackEndToEnd(testFeedback, { supabase });

    const test1Passed = pipelineResult.success === true;
    results.tests.push({
      name: 'Pipeline completes successfully',
      passed: test1Passed,
      details: test1Passed ? `Proposal: ${pipelineResult.proposalId}` : pipelineResult.error
    });
    logResult('Pipeline completes successfully', test1Passed, pipelineResult.proposalId?.slice(0, 8));

    if (!test1Passed) {
      log(`  Error: ${pipelineResult.error}`, COLORS.red);
      results.passed = false;
      return results;
    }

    const { correlationId, proposalId, executionJobId } = pipelineResult;
    results.latencies = pipelineResult.latencies;

    // =========================================================================
    // Test 2: Verify required events exist
    // =========================================================================
    logSection('Test 2: Event Verification');

    const requiredEvents = [
      EVENT_TYPES.FEEDBACK_RECEIVED,
      EVENT_TYPES.PROPOSAL_CREATED,
      EVENT_TYPES.PRIORITIZATION_COMPLETED,
      EVENT_TYPES.EXECUTION_ENQUEUED
    ];

    const trace = await getPipelineTrace(correlationId, supabase);
    results.trace = trace;

    const eventTypes = new Set(trace.timeline.map(e => e.type));

    for (const eventType of requiredEvents) {
      const hasEvent = eventTypes.has(eventType);
      results.tests.push({
        name: `Event ${eventType} emitted`,
        passed: hasEvent
      });
      logResult(`Event ${eventType}`, hasEvent);
      if (!hasEvent) results.passed = false;
    }

    // Verify event count >= 4
    const eventCountPassed = trace.eventCount >= 4;
    results.tests.push({
      name: 'At least 4 events emitted',
      passed: eventCountPassed,
      details: `Count: ${trace.eventCount}`
    });
    logResult('At least 4 events emitted', eventCountPassed, `${trace.eventCount} events`);
    if (!eventCountPassed) results.passed = false;

    // =========================================================================
    // Test 3: Idempotency verification
    // =========================================================================
    logSection('Test 3: Idempotency Verification');

    // Re-process the same feedback
    const retryResult = await processFeedbackEndToEnd(testFeedback, { supabase });

    // Should succeed (either duplicate or already processed)
    const retrySucceeded = retryResult.success === true;
    results.tests.push({
      name: 'Retry succeeds without error',
      passed: retrySucceeded
    });
    logResult('Retry succeeds without error', retrySucceeded);
    if (!retrySucceeded) results.passed = false;

    // Proposal count should still be 1
    const { count: proposalCount } = await supabase
      .from('leo_proposals')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', testFeedback.id);

    const singleProposalPassed = proposalCount === 1;
    results.tests.push({
      name: 'Exactly one proposal exists (no duplicates)',
      passed: singleProposalPassed,
      details: `Count: ${proposalCount}`
    });
    logResult('Exactly one proposal exists', singleProposalPassed, `count=${proposalCount}`);
    if (!singleProposalPassed) results.passed = false;

    // =========================================================================
    // Test 4: Latency verification
    // =========================================================================
    logSection('Test 4: Latency Verification');

    const latencyTests = [
      { name: 'Feedback → Proposal', value: results.latencies.feedbackToProposalMs },
      { name: 'Proposal → Prioritization', value: results.latencies.proposalToPrioritizationMs },
      { name: 'Prioritization → Execution', value: results.latencies.prioritizationToExecutionMs }
    ];

    for (const lt of latencyTests) {
      const latencyOk = lt.value !== null && lt.value < LATENCY_THRESHOLD_MS;
      results.tests.push({
        name: `${lt.name} < ${LATENCY_THRESHOLD_MS}ms`,
        passed: latencyOk,
        details: `${lt.value}ms`
      });
      logResult(`${lt.name} < ${LATENCY_THRESHOLD_MS}ms`, latencyOk, `${lt.value}ms`);
      // Latency failures are warnings, not hard failures
    }

    const endToEndLatency = results.latencies.endToEndMs;
    log(`  End-to-end latency: ${endToEndLatency}ms`, COLORS.gray);

    // =========================================================================
    // Test 5: Pipeline health check
    // =========================================================================
    logSection('Test 5: Pipeline Health');

    const health = await getPipelineHealth({ windowMinutes: 5, supabase });
    log(`  Events in last 5 minutes: ${Object.values(health.eventCounts).reduce((a, b) => a + b, 0)}`, COLORS.gray);
    log(`  End-to-end conversion: ${(health.conversionRates.endToEnd * 100).toFixed(1)}%`, COLORS.gray);

    // =========================================================================
    // Cleanup
    // =========================================================================
    logSection('Cleanup');

    // Delete test data
    await supabase.from('leo_proposals').delete().eq('source_id', testFeedback.id);
    await supabase.from('leo_events').delete().eq('correlation_id', correlationId);

    log('  Test data cleaned up', COLORS.gray);

    // =========================================================================
    // Summary
    // =========================================================================
    logSection('Summary');

    const totalTests = results.tests.length;
    const passedTests = results.tests.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;

    log(`  Total Tests: ${totalTests}`, COLORS.gray);
    log(`  Passed: ${passedTests}`, COLORS.green);
    if (failedTests > 0) {
      log(`  Failed: ${failedTests}`, COLORS.red);
    }

    console.log('');
    log('Latency Summary:', COLORS.cyan);
    console.log(`  Feedback → Proposal:      ${results.latencies.feedbackToProposalMs || 'N/A'}ms`);
    console.log(`  Proposal → Prioritization: ${results.latencies.proposalToPrioritizationMs || 'N/A'}ms`);
    console.log(`  Prioritization → Execution: ${results.latencies.prioritizationToExecutionMs || 'N/A'}ms`);
    console.log(`  Total End-to-End:          ${results.latencies.endToEndMs || 'N/A'}ms`);

    const totalTime = Date.now() - startTime;
    console.log('');
    log(`Total test time: ${totalTime}ms`, COLORS.gray);

    if (results.passed) {
      log('\n✅ ALL TESTS PASSED', COLORS.green);
    } else {
      log('\n❌ SOME TESTS FAILED', COLORS.red);
    }

    return results;

  } catch (error) {
    log(`\n❌ SMOKE TEST ERROR: ${error.message}`, COLORS.red);
    console.error(error.stack);
    results.passed = false;
    results.error = error.message;
    return results;
  }
}

// Run if executed directly
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('test-pipeline-smoke.js');

if (isMain) {
  runSmokeTest()
    .then(results => {
      process.exit(results.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { runSmokeTest };
