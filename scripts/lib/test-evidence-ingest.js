/**
 * Test Evidence Ingest Module
 *
 * Parses Playwright/Vitest test results and stores them in the unified
 * test evidence tables (test_runs, test_results, story_test_mappings).
 *
 * Part of LEO Protocol v4.3.4 - Test Evidence Governance
 *
 * @module test-evidence-ingest
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with service role permissions
 * Required for writing to RLS-protected test evidence tables
 */
function createServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for test evidence ingestion');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

/**
 * Computes SHA-256 hash of the raw report for integrity verification
 * @param {object} rawReport - The Playwright JSON report
 * @returns {string} SHA-256 hash as hex string
 */
function computeReportHash(rawReport) {
  const content = JSON.stringify(rawReport);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Extracts user story keys from test name or annotations
 * Looks for patterns like US-XXX, USER-STORY-XXX, @story:XXX
 *
 * @param {object} testResult - Individual test result from Playwright
 * @returns {string[]} Array of story keys found
 */
function extractStoryKeys(testResult) {
  const patterns = [
    /US-([A-Za-z0-9-]+)/gi,           // US-XXX format
    /USER-STORY-([A-Za-z0-9-]+)/gi,   // USER-STORY-XXX format
    /@story:([A-Za-z0-9-]+)/gi,       // Annotation format
    /\[([A-Za-z0-9-]+)\]/g            // Bracketed format like [SD-D3-001]
  ];

  const storyKeys = new Set();
  const searchText = `${testResult.title} ${testResult.fullTitle || ''} ${JSON.stringify(testResult.annotations || [])}`;

  for (const pattern of patterns) {
    const matches = searchText.matchAll(pattern);
    for (const match of matches) {
      // Normalize to uppercase
      storyKeys.add(match[1].toUpperCase());
    }
  }

  return Array.from(storyKeys);
}

/**
 * Maps Playwright test status to our status enum
 * @param {string} playwrightStatus - Status from Playwright
 * @returns {string} Normalized status
 */
function normalizeStatus(playwrightStatus) {
  const statusMap = {
    'passed': 'passed',
    'failed': 'failed',
    'skipped': 'skipped',
    'timedOut': 'timedOut',
    'interrupted': 'interrupted',
    // Vitest mappings
    'pass': 'passed',
    'fail': 'failed',
    'skip': 'skipped'
  };
  return statusMap[playwrightStatus] || 'failed';
}

/**
 * Determines verdict from test results
 * @param {number} passed - Number of passed tests
 * @param {number} failed - Number of failed tests
 * @param {number} total - Total tests
 * @returns {string} Verdict: PASS, FAIL, PARTIAL, ERROR
 */
function determineVerdict(passed, failed, total) {
  if (total === 0) return 'ERROR';
  if (failed === 0) return 'PASS';
  if (passed === 0) return 'FAIL';
  return 'PARTIAL';
}

/**
 * Parses Playwright JSON report and extracts test information
 *
 * @param {object} playwrightReport - Raw Playwright JSON report
 * @returns {object} Parsed test data
 */
function parsePlaywrightReport(playwrightReport) {
  const suites = playwrightReport.suites || [];
  const tests = [];

  // Recursively extract tests from suites
  function extractTests(suite, parentTitle = '') {
    const fullTitle = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;

    // Process specs in this suite
    for (const spec of (suite.specs || [])) {
      for (const test of (spec.tests || [])) {
        // Get the result (usually the last one after retries)
        const result = test.results?.[test.results.length - 1] || {};

        tests.push({
          title: spec.title,
          fullTitle: fullTitle ? `${fullTitle} > ${spec.title}` : spec.title,
          file: spec.file || suite.file,
          status: normalizeStatus(result.status || test.status),
          duration: result.duration || 0,
          retryCount: (test.results?.length || 1) - 1,
          error: result.error ? {
            message: result.error.message,
            stack: result.error.stack
          } : null,
          annotations: spec.annotations || [],
          attachments: result.attachments || []
        });
      }
    }

    // Process nested suites
    for (const nestedSuite of (suite.suites || [])) {
      extractTests(nestedSuite, fullTitle);
    }
  }

  for (const suite of suites) {
    extractTests(suite);
  }

  // Calculate summary
  const passed = tests.filter(t => t.status === 'passed').length;
  const failed = tests.filter(t => t.status === 'failed').length;
  const skipped = tests.filter(t => t.status === 'skipped').length;
  const total = tests.length;

  return {
    tests,
    summary: {
      total,
      passed,
      failed,
      skipped,
      duration: playwrightReport.duration || tests.reduce((sum, t) => sum + (t.duration || 0), 0)
    },
    config: {
      baseURL: playwrightReport.config?.projects?.[0]?.use?.baseURL,
      browser: playwrightReport.config?.projects?.[0]?.name,
      version: playwrightReport.version
    }
  };
}

/**
 * Main ingestion function - stores test results in database
 *
 * @param {object} options - Ingestion options
 * @param {string} options.sdId - Strategic Directive ID
 * @param {string} options.prdId - PRD ID (optional)
 * @param {string} options.triggeredBy - Who triggered the tests
 * @param {string} options.runType - Type of test run (playwright, vitest, ci_pipeline)
 * @param {object} options.triggerContext - Additional context (sub_agent_execution_id, etc.)
 * @param {object} options.report - Raw Playwright/Vitest JSON report
 * @param {Date} options.startedAt - When tests started
 * @param {string} options.reportFilePath - Path to archived HTML report
 * @returns {Promise<object>} Created test_run record with linked results
 */
export async function ingestTestEvidence(options) {
  const {
    sdId,
    prdId = null,
    triggeredBy = 'PLAYWRIGHT_REPORTER',
    runType = 'playwright',
    triggerContext = {},
    report,
    startedAt = new Date(),
    reportFilePath = null
  } = options;

  if (!sdId) {
    throw new Error('sdId is required for test evidence ingestion');
  }

  if (!report) {
    throw new Error('report is required for test evidence ingestion');
  }

  const supabase = createServiceClient();
  const parsed = parsePlaywrightReport(report);
  const reportHash = computeReportHash(report);
  const completedAt = new Date();

  console.log(`📊 Ingesting test evidence for SD: ${sdId}`);
  console.log(`   Tests: ${parsed.summary.total} total, ${parsed.summary.passed} passed, ${parsed.summary.failed} failed`);

  // 1. Create test_run record
  const { data: testRun, error: runError } = await supabase
    .from('test_runs')
    .insert({
      sd_id: sdId,
      prd_id: prdId,
      run_type: runType,
      triggered_by: triggeredBy,
      trigger_context: triggerContext,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: parsed.summary.duration,
      total_tests: parsed.summary.total,
      passed_tests: parsed.summary.passed,
      failed_tests: parsed.summary.failed,
      skipped_tests: parsed.summary.skipped,
      verdict: determineVerdict(parsed.summary.passed, parsed.summary.failed, parsed.summary.total),
      raw_report_json: report,
      report_hash: reportHash,
      report_file_path: reportFilePath,
      environment: {
        baseURL: parsed.config.baseURL,
        browser: parsed.config.browser,
        playwrightVersion: parsed.config.version,
        nodeVersion: process.version
      }
    })
    .select()
    .single();

  if (runError) {
    console.error('Failed to create test_run:', runError);
    throw runError;
  }

  console.log(`   ✅ Created test_run: ${testRun.id}`);

  // 2. Create test_results records
  const testResults = parsed.tests.map(test => ({
    test_run_id: testRun.id,
    test_file_path: test.file,
    test_name: test.title,
    test_full_title: test.fullTitle,
    status: test.status,
    duration_ms: test.duration,
    error_message: test.error?.message || null,
    error_stack: test.error?.stack || null,
    retry_count: test.retryCount,
    annotations: test.annotations,
    attachments: test.attachments.map(a => ({
      name: a.name,
      path: a.path,
      contentType: a.contentType
    }))
  }));

  const { data: insertedResults, error: resultsError } = await supabase
    .from('test_results')
    .insert(testResults)
    .select();

  if (resultsError) {
    console.error('Failed to create test_results:', resultsError);
    throw resultsError;
  }

  console.log(`   ✅ Created ${insertedResults.length} test_results`);

  // 3. Create story_test_mappings based on extracted story keys
  const storyMappings = [];

  for (const result of insertedResults) {
    const test = parsed.tests.find(t => t.title === result.test_name && t.file === result.test_file_path);
    if (!test) continue;

    const storyKeys = extractStoryKeys(test);
    if (storyKeys.length === 0) continue;

    // Look up user stories by story_key
    const { data: userStories } = await supabase
      .from('user_stories')
      .select('id, story_key')
      .in('story_key', storyKeys);

    if (userStories && userStories.length > 0) {
      for (const story of userStories) {
        storyMappings.push({
          user_story_id: story.id,
          test_result_id: result.id,
          test_run_id: testRun.id,
          mapping_type: 'annotation_match',
          confidence_score: 1.0,
          story_key_from_test: story.story_key
        });
      }
    }
  }

  if (storyMappings.length > 0) {
    const { error: mappingError } = await supabase
      .from('story_test_mappings')
      .insert(storyMappings);

    if (mappingError) {
      console.error('Failed to create story_test_mappings:', mappingError);
      // Don't throw - mappings are nice to have but not critical
    } else {
      console.log(`   ✅ Created ${storyMappings.length} story_test_mappings`);
    }
  }

  return {
    testRun,
    testResultsCount: insertedResults.length,
    storyMappingsCount: storyMappings.length
  };
}

/**
 * Queries latest test evidence for an SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<object|null>} Latest test evidence or null
 */
export async function getLatestTestEvidence(sdId) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('v_latest_test_evidence')
    .select('*')
    .eq('sd_id', sdId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to query test evidence:', error);
    throw error;
  }

  return data;
}

/**
 * Queries story test coverage for an SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<object[]>} Array of story coverage records
 */
export async function getStoryTestCoverage(sdId) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('v_story_test_coverage')
    .select('*')
    .eq('sd_id', sdId);

  if (error) {
    console.error('Failed to query story coverage:', error);
    throw error;
  }

  return data || [];
}

/**
 * Queries SD test readiness (aggregate metrics)
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<object|null>} Test readiness metrics or null
 */
export async function getSDTestReadiness(sdId) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('v_sd_test_readiness')
    .select('*')
    .eq('sd_id', sdId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to query test readiness:', error);
    throw error;
  }

  return data;
}

/**
 * Checks if test evidence is fresh enough for handoff
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {number} maxAgeMinutes - Maximum age in minutes (default: 60)
 * @returns {Promise<object>} Freshness check result
 */
export async function checkTestEvidenceFreshness(sdId, maxAgeMinutes = 60) {
  const evidence = await getLatestTestEvidence(sdId);

  if (!evidence) {
    return {
      isFresh: false,
      reason: 'No test evidence found',
      recommendation: 'Run E2E tests to generate evidence'
    };
  }

  const isFresh = evidence.freshness_status === 'FRESH' ||
    (evidence.age_minutes !== null && evidence.age_minutes <= maxAgeMinutes);

  return {
    isFresh,
    evidence,
    ageMinutes: evidence.age_minutes,
    freshnessStatus: evidence.freshness_status,
    reason: isFresh ? 'Evidence is fresh' : `Evidence is ${evidence.freshness_status?.toLowerCase() || 'stale'}`,
    recommendation: isFresh ? null : 'Consider re-running tests for fresh evidence'
  };
}

export default {
  ingestTestEvidence,
  getLatestTestEvidence,
  getStoryTestCoverage,
  getSDTestReadiness,
  checkTestEvidenceFreshness
};
