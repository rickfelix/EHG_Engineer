/**
 * QF-20260912-758: a quick-fix whose PR adds/modifies a database/ file must not complete while
 * that file's objects are not yet live -- the QF-20260912-253 specimen shipped "completed" while
 * 20260912_feedback_triage_assignment_columns.sql stayed NOT_APPLIED for hours, throwing
 * column-not-found in production until the chairman applied it in the room. SDs carry this check
 * via CHAIRMAN_APPLY_VERIFICATION at LEAD-FINAL; quick fixes had no equivalent.
 *
 * Pure decision logic only -- the actual DB classification comes from
 * classifyMigrationFiles() in scripts/verify-migration-apply-state.mjs (reused, never
 * re-implemented or shelled out to).
 */

/** classifyFiles() never returns these for a file with real DDL that is fully live. */
const PASSING_STATUSES = new Set(['APPLIED', 'NO_DDL']);

/** @param {string[]} filesChanged @returns {string[]} the subset under database/ */
export function filterDatabaseFiles(filesChanged) {
  return (filesChanged || []).filter((f) => typeof f === 'string' && f.startsWith('database/'));
}

/**
 * @param {Array<{file:string,status:string}>} results from classifyMigrationFiles()
 * @returns {Array<{file:string,status:string}>} the subset that is NOT fully live
 */
export function findApplyStateBlockers(results) {
  return (results || []).filter((r) => r && !PASSING_STATUSES.has(r.status));
}

/** @param {string} file @returns {string} human-readable apply-path hint for the refusal message */
export function describeApplyPath(file) {
  return file.startsWith('database/chairman-gated/')
    ? 'chairman apply via the 3c ceremony (this file is chairman-gated)'
    : 'a worker apply of the migration file (or promotion to database/chairman-gated/ if it alters existing objects)';
}
