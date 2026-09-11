/**
 * SD-LEO-FIX-WIRE-SEVEN-RETROSPECTIVE-001 FR-3 — shared same-statement-token write helper.
 *
 * The PUBLISHED-guard trigger (database/chairman-gated/20260906_retrospectives_published_guard.sql)
 * requires every writer to set retro_write_token in the SAME UPDATE statement once the trigger is
 * live. But retro_write_token (database/migrations/20260908_retrospectives_retro_write_token_column.sql)
 * and the trigger itself ship on DIFFERENT, independently-gated apply paths (additive vs
 * chairman-verbal) — a caller cannot assume the column exists yet at the moment this code ships.
 * Mirrors the fail-soft retry already proven in scripts/one-off/restore-retro-from-audit.mjs: try
 * WITH the token first (forward-compatible with the guard once live), and if PostgREST reports the
 * column doesn't exist yet (PGRST204 / 42703), retry the exact same write WITHOUT it — so this code
 * needs no coordinated release with the migration apply in either direction.
 *
 * @param {(payload: object) => Promise<{data: any, error: any}>} runUpdate - executes the Supabase
 *   `.update(payload)...` call (with whatever `.eq()`/`.select()`/`.single()` chain the caller needs)
 *   against the given payload.
 * @param {object} payload - the update payload WITHOUT the token.
 * @param {string} writerIdentity - this call site's registered identity in
 *   retro_canonical_writer_policy() (e.g. 'retro_sub_agent').
 * @returns {Promise<{data: any, error: any}>}
 */
export async function updateRetrospectiveWithToken(runUpdate, payload, writerIdentity) {
  const withToken = { ...payload, retro_write_token: writerIdentity };
  const first = await runUpdate(withToken);
  if (first.error && (first.error.code === 'PGRST204' || first.error.code === '42703')) {
    return runUpdate(payload);
  }
  return first;
}
