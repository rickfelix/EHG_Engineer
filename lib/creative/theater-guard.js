// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-3) — artifact-theater guard gauge (O3).
// Flags any creative_assets row with no EXECUTED consuming channel action within its plan
// window -- reference alone does not count as reach. Schema-independent of child C's
// distribution_channel_config rebuild shape: this sweep reads ONLY creative_assets.consumed_at,
// the abstraction boundary the FR-1 migration deliberately added for this purpose. Whatever
// process marks an asset consumed (the creative-brief seam, or a future demand-engine execution
// hook) is responsible for setting consumed_at; this module never queries channel tables
// directly, so it cannot be broken by C landing a different distribution_channel_config shape.
//
// PLAN-WINDOW NOTE (PRD open item, not yet numerically fixed at PLAN time): the PRD explicitly
// left the plan-window duration and sweep cadence unpinned. DEFAULT_PLAN_WINDOW_MS below is a
// documented placeholder (24h), not a ratified operational value -- callers should override via
// the planWindowMs param once the coordinator/chairman pins the real number. Presenting this as
// anything other than a placeholder would be exactly the fabricated-precision anti-pattern this
// program's gauges are built to avoid.

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: the sweep FLAGS theater by
// iterating every unconsumed asset — an accumulating unconsumed backlog IS the condition
// this guard detects, so a read silently capped at the PostgREST 1000-row max would hide
// theater. Paginate to completion.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

export const DEFAULT_PLAN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h placeholder — see note above.

/**
 * Pure sweep logic — no I/O, so it's trivially unit-testable (mirrors the
 * lib/worktree-reaper/pools.js computePoolUtilization pattern used elsewhere in this repo).
 *
 * A row is flagged when it has never been consumed (consumed_at IS NULL) AND its creation is
 * older than the plan window. An asset actively referenced (consumed_at set, even if that
 * timestamp itself is old — "actively referenced" means the seam re-touches consumed_at on
 * every live reference, not just the first) is never flagged (AC-2: reused/pre-staged library
 * assets under active reference are excluded from false-positive flagging).
 *
 * @param {Array<{id: string, created_at: string, consumed_at: string|null}>} rows
 * @param {{ now?: Date, planWindowMs?: number }} [options]
 * @returns {{ flagged: Array<{id: string, reason: string}>, checked: number, planWindowMs: number }}
 */
export function sweepArtifactTheater(rows, { now = new Date(), planWindowMs = DEFAULT_PLAN_WINDOW_MS } = {}) {
  const nowMs = now.getTime();
  const flagged = [];

  for (const row of rows || []) {
    if (row.consumed_at) continue; // actively referenced — never flagged, regardless of age (AC-2)
    const createdMs = new Date(row.created_at).getTime();
    if (Number.isFinite(createdMs) && nowMs - createdMs > planWindowMs) {
      flagged.push({ id: row.id, reason: 'NO_CONSUMING_CHANNEL_ACTION_WITHIN_PLAN_WINDOW' });
    }
  }

  return { flagged, checked: (rows || []).length, planWindowMs };
}

/**
 * DB-facing wrapper: fetches unconsumed creative_assets rows and runs the sweep. Only fetches
 * consumed_at IS NULL rows (cheap query — never needs the full table), matching AC-1 (a row
 * with no consuming channel action trips the guard within one sweep).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ now?: Date, planWindowMs?: number }} [options]
 */
export async function runArtifactTheaterSweep(supabase, options = {}) {
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('creative_assets') // schema-lint-disable-line: chairman-gated migration (20260712_creative_assets.sql, PR #5981 merged, MERGED != LIVE) not yet applied to the live snapshot
      .select('id, created_at, consumed_at')
      .is('consumed_at', null)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (error) {
    throw error; // prior `if (error) throw error` policy preserved (fail-closed)
  }
  return sweepArtifactTheater(rows, options);
}
