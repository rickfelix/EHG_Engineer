'use strict';
// Harness-backlog drain gauge — SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 / FR-9.
// Surfaces open-actionable count + oldest-actionable-age for category='harness_backlog'
// so the sink class (2,320+ write-only rows, zero closures) is visible on the
// coordinator board if it ever re-forms. Follows the established gauge pattern
// (feedback-sla-gauge.cjs / relay-drop-gauge.cjs / strand-age-gauge.cjs): a pure
// plan<Name>() computing fresh from live data every call, no cached/derived state.

const RESOLVED_EQUIVALENT_STATUSES = Object.freeze(['resolved', 'wont_fix', 'duplicate', 'invalid', 'shipped']);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Computes open-actionable count (exact, via a head-only count() query — never a
 * row-fetch, which PostgREST implicitly caps at 1000 and would silently undercount
 * a backlog this size) + oldest-actionable age (a single ORDER BY created_at ASC
 * LIMIT 1 lookup, not a full table scan). NO-DATA on query failure (never silently
 * reports a stale/zero count as if it were live) — the established gauge convention.
 *
 * @returns {Promise<{ noData: false, openCount: number, oldestAgeDays: number|null } | { noData: true, reason: string }>}
 */
async function planDrainGauge(supabase, { nowMs = Date.now() } = {}) {
  const openFilter = (query) =>
    query
      .eq('category', 'harness_backlog')
      .is('archived_at', null)
      .not('status', 'in', `(${RESOLVED_EQUIVALENT_STATUSES.join(',')})`);

  const { count, error: countError } = await openFilter(
    supabase.from('feedback').select('id', { count: 'exact', head: true })
  );
  if (countError) {
    return { noData: true, reason: `drain gauge count query failed: ${countError.message}` };
  }
  if (!count) {
    return { noData: false, openCount: 0, oldestAgeDays: null };
  }

  const { data: oldestRows, error: oldestError } = await openFilter(
    supabase.from('feedback').select('created_at')
  ).order('created_at', { ascending: true }).limit(1);
  if (oldestError) {
    return { noData: true, reason: `drain gauge oldest-row query failed: ${oldestError.message}` };
  }

  const oldestAgeDays = oldestRows?.[0]
    ? Math.floor((nowMs - new Date(oldestRows[0].created_at).getTime()) / DAY_MS)
    : null;

  return { noData: false, openCount: count, oldestAgeDays };
}

module.exports = { RESOLVED_EQUIVALENT_STATUSES, planDrainGauge };
