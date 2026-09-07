'use strict';
/**
 * query-with-archive.cjs — SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D FR-3.
 *
 * Gives a NEW caller a way to query public.session_coordination and its archive counterpart
 * public.session_coordination_archive (database/chairman-gated/20260907_session_coordination_archive.sql,
 * chairman-gated — not yet applied) together, as one result set.
 *
 * SCOPE BOUNDARY (explicit): this does NOT migrate any EXISTING reader of session_coordination
 * to also read the archive -- every current call site is unaffected. It exists only so a
 * caller that specifically needs historical + live visibility (e.g. a future retention-aware
 * report) has one helper instead of hand-rolling a second query. Until a retention job actually
 * moves rows into the archive table, the archive half of every result is simply empty --
 * byte-identical to querying the live table alone.
 *
 * Caller supplies a `buildQuery(queryBuilder)` function that applies its own filters (the same
 * function is applied to BOTH tables' query builders unmodified, since the archive table's
 * column set mirrors the live table's exactly) and returns the built query. This keeps the
 * helper filter-shape-agnostic rather than re-inventing a bespoke filter DSL.
 */

/**
 * @param {object} supabase - injected client
 * @param {(query: any) => any} buildQuery - applies filters/order/limit to a `.from()` query builder
 * @param {{ includeArchive?: boolean }} [opts]
 * @returns {Promise<{ noData: true, reason: string } | { noData: false, rows: Array<object> }>}
 */
async function queryWithArchive(supabase, buildQuery, { includeArchive = true } = {}) {
  const liveQuery = buildQuery(supabase.from('session_coordination'));
  const { data: liveRows, error: liveError } = await liveQuery;
  if (liveError) {
    return { noData: true, reason: `query-with-archive live query failed: ${liveError.message}` };
  }

  if (!includeArchive) {
    return { noData: false, rows: liveRows || [] };
  }

  const archiveQuery = buildQuery(supabase.from('session_coordination_archive'));
  const { data: archiveRows, error: archiveError } = await archiveQuery;
  if (archiveError) {
    return { noData: true, reason: `query-with-archive archive query failed: ${archiveError.message}` };
  }

  return { noData: false, rows: [...(liveRows || []), ...(archiveRows || [])] };
}

module.exports = { queryWithArchive };
