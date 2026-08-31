/**
 * Orphaned-escalated-QF sweep — QF-20260831-191.
 *
 * Pure detection logic (no DB), mirroring hold-state-sweep.js's fetch-then-detect split. A
 * quick_fixes row can reach status='escalated' with escalated_to_sd_id NULL — the QF lane treats
 * it as done, no SD exists yet, so the work sits in NO lane, invisible to every reader that scans
 * either the open-QF queue or strategic_directives_v2. Witnessed specimens: QF-20260831-310 and
 * -373 both sat this way until hand-linked to their SDs.
 *
 * quick_fixes has no updated_at/escalated_at column — created_at is the best available proxy for
 * "when this row entered its current state" (escalation happens at classify time, close to
 * creation in practice). Grace window default matches the QF's own suggestion (30min) so a normal
 * classify->SD-creation lag never false-trips.
 */

export const DEFAULT_GRACE_MS = 30 * 60 * 1000;

/**
 * @param {Array<{id, created_at}>} rows
 * @param {number} nowMs
 * @param {number} [graceMs]
 * @returns {{count:number, orphaned:Array<{id, created_at, age_minutes}>}}
 */
export function findOrphanedEscalatedQfs(rows, nowMs, graceMs = DEFAULT_GRACE_MS) {
  const orphaned = [];
  for (const row of rows || []) {
    const createdAt = row && row.created_at;
    if (!createdAt) continue;
    const parsed = Date.parse(createdAt);
    if (!Number.isFinite(parsed)) continue;
    if (nowMs - parsed >= graceMs) {
      orphaned.push({ id: row.id, created_at: createdAt, age_minutes: Math.round((nowMs - parsed) / 60000) });
    }
  }
  return { count: orphaned.length, orphaned };
}

export default { findOrphanedEscalatedQfs, DEFAULT_GRACE_MS };
