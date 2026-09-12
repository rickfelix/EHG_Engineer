/**
 * Capability probe + normalizer for venture_channel_publish_ledger.execution_mode.
 *
 * SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-4. The column is added by a chairman-gated migration
 * (database/chairman-gated/20260912_venture_channel_publish_ledger_execution_mode.sql) that may
 * ship un-applied for an indeterminate period -- mirrors the established template in
 * lib/eva/stage-write-token-probe.js for the directly analogous ventures.stage_write_token
 * column. PostgREST rejects an INSERT payload containing an unknown column outright (PGRST204),
 * so every writer that stamps execution_mode must probe for the column's existence at runtime
 * and degrade to a plain, unstamped write when it is absent -- SECURITY finding SEC-H1
 * (sub_agent_execution_results 3ed447ec-de8c-4798-9fdc-5a0c814623a5): adding the column stamp to
 * the ledger INSERT calls unconditionally would have hard-failed every autonomous/propose
 * publish attempt in production the instant this code shipped, since the column does not exist
 * in the live schema until the chairman applies the migration.
 *
 * The probe result is cached for the lifetime of the process ONLY once confirmed either way by a
 * recognized "column does not exist" error code (42703 = Postgres undefined_column; PGRST204 =
 * PostgREST schema-cache miss for the same condition) -- an unrelated transient error (network,
 * auth) is never cached, so a real outage doesn't permanently wedge every future call into the
 * "absent" branch for the rest of the process.
 */

let executionModeExists = null; // null = unknown, true = confirmed present, false = confirmed absent

const COLUMN_ABSENT_CODES = new Set(['42703', 'PGRST204']);

/**
 * @param {object} supabase - Supabase client (service_role, or any role with SELECT on the ledger).
 * @returns {Promise<boolean>}
 */
export async function probeExecutionModeExists(supabase) {
  if (executionModeExists !== null) return executionModeExists;
  if (!supabase) return false;
  try {
    // Intentional existence probe for a column the static schema snapshot doesn't know about yet
    // -- it only exists once the chairman applies the FR-4 migration.
    const { error } = await supabase.from('venture_channel_publish_ledger').select('execution_mode').limit(1); // schema-lint-disable-line
    if (!error) {
      executionModeExists = true;
      return true;
    }
    if (COLUMN_ABSENT_CODES.has(error.code)) {
      executionModeExists = false;
      return false;
    }
    // Unrecognized error (network/auth/etc.) -- don't cache; degrade for this call only, retry
    // fresh next time.
    return false;
  } catch {
    // This function's whole contract is "never throw, always resolve to a safe default" --
    // a mock supabase in a test that doesn't implement .select()/.limit() must not propagate a
    // thrown exception into the caller's own ledger-write path.
    return false;
  }
}

/**
 * @param {object} supabase
 * @param {'live'|'mock'} mode
 * @returns {Promise<{execution_mode: string} | {}>} spreadable into an .insert() payload.
 */
export async function executionModeField(supabase, mode) {
  return (await probeExecutionModeExists(supabase)) ? { execution_mode: mode } : {};
}

/**
 * Production self-heal (SECURITY finding SEC-H1-R, sub_agent_execution_results
 * 9b8602a9-76bb-4b2c-b36f-01f4625b720c): the process-lifetime cache above is safe for the
 * analogous stage_write_token probe (lib/eva/stage-write-token-probe.js) because that column
 * has a soft-degrading UPDATE writer with no NOT NULL constraint -- a stale "absent" cache just
 * means the stamp is skipped, forever, until the process restarts. execution_mode is different
 * BY DESIGN (NOT NULL, no default -- FR-4's migration header: "a future writer that omits the
 * column entirely must fail the INSERT outright"), so a process that cached "absent" BEFORE the
 * chairman applies the migration and is still running AFTER would reproduce SEC-H1's exact
 * symptom for its own remaining lifetime: every ledger INSERT it attempts omits the now-required
 * column and hard-fails with 23502. Call this to invalidate the cache when that specific failure
 * is observed, so the very next attempt re-probes fresh and self-heals without a restart.
 */
export function invalidateExecutionModeProbeCache() {
  executionModeExists = null;
}

/** Test-only: reset the process-lifetime cache between test cases. */
export function __resetExecutionModeProbeForTests() {
  executionModeExists = null;
}
