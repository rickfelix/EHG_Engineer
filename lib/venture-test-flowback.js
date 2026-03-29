/**
 * Venture Test Flow-Back Pipeline
 *
 * Captures test results from venture CI and writes to shared Supabase.
 * SD-LEO-INFRA-VENTURE-DEVWORKFLOW-AWARENESS-001-P
 *
 * @module lib/venture-test-flowback
 */

import { createSupabaseServiceClient } from './supabase-client.js';

/**
 * Record test results from a venture CI run.
 *
 * @param {Object} opts
 * @param {string} opts.ventureId - Venture app ID from registry
 * @param {string} opts.repoName - GitHub repo name
 * @param {string} opts.commitSha - Git commit SHA
 * @param {number} opts.passed - Number of passing tests
 * @param {number} opts.failed - Number of failing tests
 * @param {number} opts.total - Total test count
 * @param {string} [opts.branch='main'] - Branch name
 * @param {Object} [opts.metadata] - Additional metadata
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function recordTestResults({ ventureId, repoName, commitSha, passed, failed, total, branch = 'main', metadata }) {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase.from('venture_stage_work').insert({
    venture_id: ventureId,
    stage_number: 0, // CI stage
    work_type: 'ci_test_results',
    status: failed > 0 ? 'needs_attention' : 'completed',
    work_data: {
      repo: repoName,
      commit_sha: commitSha,
      branch,
      test_results: { passed, failed, total },
      recorded_at: new Date().toISOString(),
      ...(metadata || {}),
    },
  }).select('id').single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/**
 * Parse JUnit XML test output into structured results.
 *
 * @param {string} xml - JUnit XML string
 * @returns {{ passed: number, failed: number, total: number, suites: Array }}
 */
export function parseJUnitResults(xml) {
  const testsuiteMatch = xml.match(/<testsuite[^>]+tests="(\d+)"[^>]+failures="(\d+)"[^>]*(?:errors="(\d+)")?/);
  if (!testsuiteMatch) return { passed: 0, failed: 0, total: 0, suites: [] };

  const total = parseInt(testsuiteMatch[1], 10);
  const failures = parseInt(testsuiteMatch[2], 10);
  const errors = parseInt(testsuiteMatch[3] || '0', 10);
  const failed = failures + errors;

  return { passed: total - failed, failed, total, suites: [] };
}

export default { recordTestResults, parseJUnitResults };
