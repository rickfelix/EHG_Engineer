/**
 * L30 evidence collector — "Harness retention-reaper (unbounded tables)".
 * (SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001)
 *
 * Reads retention_archive for the most recent successful cleanup_expired_coordination
 * round trip on session_coordination (the reaper fixed by SD-FDBK-FIX-BUS-RETENTION-
 * CLEANUP-001 + QF-20260713-277). The function RAISE EXCEPTIONs on any archive/delete
 * count mismatch inside one transaction, so a row's mere existence in retention_archive
 * proves a matching DELETE also succeeded — this is stronger evidence than the sweep's
 * self-stamped periodic_process_registry witness (which stamps on every tick regardless
 * of whether the RPC itself succeeded).
 *
 * edgeAt is INTENTIONALLY always null. L30's display_name is plural — "unbounded
 * TABLES" — but this collector only has evidence for ONE of them (session_coordination).
 * Supplying a real edgeAt would let the edge_freshness predicate (30-day window) evaluate
 * CLOSED the moment any single archive round lands, a false-CLOSE for a loop whose true
 * scope (retention across every unbounded harness table) is nowhere near closed. Returning
 * { upstreamFiredAt, edgeAt: null } lands on the documented "OPEN when it fired but the
 * edge is absent" path in closure-engine.js — the correct honest shape for a collector
 * that can prove activity but not full closure. Any FUTURE collector for a similarly
 * broader-than-observed loop should follow this same pattern rather than inventing a
 * synthetic edge just to reach CLOSED.
 */

const SOURCE_TABLE = 'session_coordination';
const ARCHIVED_BY = 'cleanup_expired_coordination';

/**
 * @param {Object} supabase - service-role client
 * @returns {Promise<Object>} evidence: {} if never fired, else {upstreamFiredAt, edgeAt:null}
 */
export async function collectSessionCoordinationRetentionEvidence(supabase) {
  const { data, error } = await supabase
    .from('retention_archive')
    .select('archived_at')
    .eq('source_table', SOURCE_TABLE)
    .eq('archived_by', ARCHIVED_BY)
    .order('archived_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`session-coordination-retention collector: retention_archive query failed: ${error.message}`);
  }

  const latest = Array.isArray(data) ? data[0] : null;
  if (!latest || !latest.archived_at) return {};

  return { upstreamFiredAt: latest.archived_at, edgeAt: null };
}
