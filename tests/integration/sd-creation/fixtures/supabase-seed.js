/**
 * Shared Supabase seed/cleanup helper for SD creation integration tests.
 *
 * Contract (from PRD-SD-MAN-INFRA-E2E-REGRESSION-TEST-001):
 *   - Every test is scoped by a unique TEST_RUN_ID prefix.
 *   - afterEach / afterAll deletes all rows matching that prefix to keep the
 *     shared Supabase project clean across parallel CI runs.
 *   - Seed helpers insert rows needed by the flag-mode under test
 *     (feedback_items, issue_patterns, uat_test_results) and return the
 *     created primary keys so the test can invoke the real SD-creation path.
 *
 * All helpers use createSupabaseServiceClient from scripts/lib/supabase-connection.js.
 * Do not open a new client pattern in tests — use this helper.
 */

import { randomUUID } from 'node:crypto';
import { createSupabaseServiceClient } from '../../../../scripts/lib/supabase-connection.js';

let _supabase = null;

/**
 * Lazy-initialized Supabase service-role client.
 * Returns null when credentials are missing so tests can skip gracefully.
 */
export async function getSupabase() {
  if (_supabase) return _supabase;
  if (!credentialsPresent()) return null;
  _supabase = await createSupabaseServiceClient();
  return _supabase;
}

/**
 * Returns true when SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL are both set
 * to non-placeholder values. Used to gate tests in CI fork runs.
 */
export function credentialsPresent() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  if (url.includes('your_supabase_url_here')) return false;
  if (key.includes('your_supabase_key_here')) return false;
  return true;
}

/**
 * Generate a unique TEST_RUN_ID for this test invocation.
 * Format: test-e2e-<timestamp>-<shortuuid> — keep prefix 'test-e2e-' so the
 * cleanup query is unambiguous.
 */
export function newTestRunId() {
  return `test-e2e-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

/**
 * Seed a feedback_items row for --from-feedback mode tests.
 *
 * @param {string} testRunId - prefix from newTestRunId()
 * @param {object} overrides - optional field overrides
 * @returns {Promise<{id: string, row: object}>}
 */
export async function seedFeedback(testRunId, overrides = {}) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase credentials missing — cannot seed feedback');

  const id = `${testRunId}-feedback-${randomUUID().slice(0, 4)}`;
  const row = {
    id,
    feedback_type: overrides.feedback_type || 'issue',
    title: overrides.title || `${testRunId} seeded feedback`,
    description: overrides.description || `Seeded by integration test ${testRunId}`,
    priority: overrides.priority || 'P2',
    status: overrides.status || 'triaged',
    source: overrides.source || 'integration-test',
    ...overrides,
  };

  const { data, error } = await supabase.from('feedback_items').insert(row).select().single();
  if (error) throw new Error(`seedFeedback failed: ${error.message}`);
  return { id, row: data };
}

/**
 * Seed an issue_patterns row for --from-learn mode tests.
 *
 * @param {string} testRunId - prefix from newTestRunId()
 * @param {object} overrides - optional field overrides
 * @returns {Promise<{pattern_id: string, row: object}>}
 */
export async function seedPattern(testRunId, overrides = {}) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase credentials missing — cannot seed pattern');

  const pattern_id = `PAT-${testRunId}-${randomUUID().slice(0, 4)}`.toUpperCase();
  const row = {
    pattern_id,
    category: overrides.category || 'testing',
    severity: overrides.severity || 'medium',
    issue_summary: overrides.issue_summary || `${testRunId} seeded pattern`,
    occurrence_count: overrides.occurrence_count ?? 3,
    status: overrides.status || 'active',
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    ...overrides,
  };

  const { data, error } = await supabase.from('issue_patterns').insert(row).select().single();
  if (error) throw new Error(`seedPattern failed: ${error.message}`);
  return { pattern_id, row: data };
}

/**
 * Seed a uat_test_results row for --from-uat mode tests.
 *
 * @param {string} testRunId - prefix from newTestRunId()
 * @param {object} overrides - optional field overrides
 * @returns {Promise<{id: string, row: object}>}
 */
export async function seedUATResult(testRunId, overrides = {}) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase credentials missing — cannot seed uat result');

  const id = `${testRunId}-uat-${randomUUID().slice(0, 4)}`;
  const row = {
    id,
    test_id: overrides.test_id || `UAT-${testRunId}`,
    test_name: overrides.test_name || `${testRunId} seeded UAT`,
    status: overrides.status || 'failed',
    failure_reason: overrides.failure_reason || `${testRunId}: regression seed`,
    priority: overrides.priority || 'high',
    created_at: new Date().toISOString(),
    ...overrides,
  };

  const { data, error } = await supabase.from('uat_test_results').insert(row).select().single();
  if (error) throw new Error(`seedUATResult failed: ${error.message}`);
  return { id, row: data };
}

/**
 * Delete every row inserted under a TEST_RUN_ID prefix across all tables
 * that the seed helpers write to, plus the strategic_directives_v2 rows
 * those seeds may have produced via the SD-creation paths under test.
 *
 * Safe to call even when a seed step failed mid-way; each delete is
 * independent and errors are collected-not-thrown so cleanup always runs.
 *
 * @param {string} testRunId - prefix from newTestRunId()
 */
export async function cleanup(testRunId) {
  const supabase = await getSupabase();
  if (!supabase) return { skipped: true };
  if (!testRunId || !testRunId.startsWith('test-e2e-')) {
    throw new Error(`cleanup refused: testRunId "${testRunId}" must start with "test-e2e-"`);
  }

  const errors = [];
  const tables = [
    { name: 'strategic_directives_v2', col: 'sd_key' },
    { name: 'strategic_directives_v2', col: 'id' },
    { name: 'feedback_items', col: 'id' },
    { name: 'issue_patterns', col: 'pattern_id' },
    { name: 'uat_test_results', col: 'id' },
  ];

  for (const { name, col } of tables) {
    const filter = col === 'pattern_id' ? `PAT-${testRunId.toUpperCase()}%` : `${testRunId}%`;
    const { error } = await supabase.from(name).delete().ilike(col, filter);
    if (error) errors.push({ table: name, col, error: error.message });
  }

  return { errors, skipped: false };
}
