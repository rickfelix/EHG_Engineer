/**
 * Shared Supabase seed/cleanup helper for SD creation integration tests.
 *
 * Contract (from PRD-SD-MAN-INFRA-E2E-REGRESSION-TEST-001):
 *   - Every test is scoped by a unique TEST_RUN_ID prefix.
 *   - afterEach / afterAll deletes all rows matching that prefix to keep the
 *     shared Supabase project clean across parallel CI runs.
 *   - Seed helpers insert rows needed by the flag-mode under test and
 *     return the created primary keys so the test can invoke the real
 *     SD-creation path.
 *
 * Schema alignment (verified 2026-04-23 against live DB):
 *   - uat_test_results columns: id, run_id, test_case_id, status,
 *     error_message, failure_category, metadata (no failure_reason, no
 *     test_name, no priority — those fields live on uat_test_cases).
 *   - issue_patterns columns: pattern_id, category, severity, issue_summary,
 *     occurrence_count, status, first_seen_at, last_seen_at.
 *   - feedback_items table DOES NOT EXIST in this Supabase project — the
 *     --from-feedback flag mode is tested via the mapping contract alone,
 *     not a DB round-trip through a non-existent table.
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
 * Seed an issue_patterns row for --from-learn mode tests.
 *
 * @param {string} testRunId - prefix from newTestRunId()
 * @param {object} overrides - optional field overrides
 * @returns {Promise<{pattern_id: string, row: object}>}
 */
export async function seedPattern(testRunId, overrides = {}) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase credentials missing — cannot seed pattern');

  // pattern_id format: PAT-<short>-<NUM> — observed in DB as "PAT-001",
  // "DB-TRIG-PROF-001". Keep it short (≤24 chars) and all-caps to match the
  // existing corpus.
  const shortId = randomUUID().slice(0, 6).toUpperCase();
  const pattern_id = `PAT-E2E-${shortId}`;
  const row = {
    pattern_id,
    category: overrides.category || 'testing',
    severity: overrides.severity || 'medium',
    issue_summary: overrides.issue_summary || `${testRunId} seeded pattern`,
    occurrence_count: overrides.occurrence_count ?? 3,
    status: overrides.status || 'active',
    ...overrides,
  };

  const { data, error } = await supabase.from('issue_patterns').insert(row).select().single();
  if (error) throw new Error(`seedPattern failed: ${error.message}`);
  return { pattern_id, row: data };
}

/**
 * Build a simulated UAT failure payload for --from-uat mode tests.
 *
 * NOTE: We do NOT insert into uat_test_results because `run_id` is a FK to
 * `uat_test_runs` and seeding a run record (plus a matching test_case_id FK
 * to uat_test_cases) would pollute a chain of production tables. The
 * UATToSDConverter takes a payload object in practice, so simulating the
 * payload is the same contract surface the production code exercises.
 *
 * @param {string} testRunId - prefix from newTestRunId()
 * @param {object} overrides - optional field overrides
 * @returns {{id: string, row: object}} In-memory UAT payload
 */
export function buildUATPayload(testRunId, overrides = {}) {
  const id = randomUUID();
  const row = {
    id,
    test_case_id: overrides.test_case_id || `${testRunId}-tc`,
    run_id: overrides.run_id || `${testRunId}-run`,
    status: overrides.status || 'failed',
    error_message: overrides.error_message || `${testRunId}: regression seed`,
    failure_category: overrides.failure_category || 'regression',
    ...overrides,
  };
  return { id, row };
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
  // strategic_directives_v2: filter by sd_key prefix (testRunId is embedded
  // in the semantic via title). We ALSO clean by id for rows we inserted.
  // issue_patterns: pattern_id uses PAT-E2E-<short> prefix.
  // uat_test_results: id is a UUID (not testRunId-prefixed), so we clean by
  // error_message which always contains testRunId.
  const strategies = [
    { name: 'strategic_directives_v2', col: 'sd_key', filter: `${testRunId}%` },
    { name: 'strategic_directives_v2', col: 'id', filter: `${testRunId}%` },
    { name: 'strategic_directives_v2', col: 'title', filter: `${testRunId}%` },
    { name: 'issue_patterns', col: 'issue_summary', filter: `${testRunId}%` },
  ];

  for (const { name, col, filter } of strategies) {
    const { error } = await supabase.from(name).delete().ilike(col, filter);
    if (error) errors.push({ table: name, col, error: error.message });
  }

  return { errors, skipped: false };
}
