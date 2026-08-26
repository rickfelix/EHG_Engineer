/**
 * Pure decision step for orchestrator-completion-guardian.js recordPatternSuccess():
 * given the result of the occurrence_count/success_rate fetch, decide what to do next.
 *
 * Three DISTINCT outcomes, never collapsed into one another (INV-001-control-without-
 * could-not-check-path, feedback 85faa739-af14-475c-aade-fc7f4b327742):
 *   - 'could-not-check': the read itself failed (fetchError set). No claim is made about
 *     whether the row exists. Must be logged distinctly from a confirmed miss so a
 *     transient DB outage never reads identically to a permanently-missing pattern_id.
 *   - 'not-found': the read succeeded and definitively found no row.
 *   - 'update': the read succeeded and found a row -- returns the exact update payload
 *     (occurrence_count/success_rate), computed as a running average.
 *
 * Extracted as a pure function (no supabase) so all three branches -- including the
 * fetch-error branch, which cannot be exercised without mocking the module-level
 * supabase client -- are unit-testable directly.
 *
 * @param {{ fetchError: {message: string}|null, pattern: {occurrence_count?: number, success_rate?: number}|null, outcomeScore: number }} args
 * @returns {{ action: 'could-not-check'|'not-found'|'update', logMessage: string, payload?: {occurrence_count: number, success_rate: number} }}
 */
export function resolvePatternSuccessUpdate({ fetchError, pattern, outcomeScore }) {
  if (fetchError) {
    return {
      action: 'could-not-check',
      logMessage: `Pattern success recording COULD NOT BE CHECKED (query error, not a confirmed miss): ${fetchError.message}`,
    };
  }
  if (!pattern) {
    return {
      action: 'not-found',
      logMessage: 'Pattern success recording skipped: PAT-ORCH-001 not found (known gap, see comment above)',
    };
  }

  const nextCount = (pattern.occurrence_count || 0) + 1;
  const nextRate = ((pattern.success_rate || 0) * (pattern.occurrence_count || 0) + outcomeScore) / nextCount;

  return {
    action: 'update',
    logMessage: `Recording pattern success: occurrence_count -> ${nextCount}, success_rate -> ${nextRate}`,
    payload: { occurrence_count: nextCount, success_rate: nextRate },
  };
}
