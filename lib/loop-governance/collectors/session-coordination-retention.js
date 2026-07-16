/**
 * L30 evidence collector — "Harness retention-reaper (unbounded tables)".
 * (SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001, SD-LEO-INFRA-L30-CLOSURE-EDGE-001)
 *
 * Reads retention_archive for the most recent successful cleanup_expired_coordination
 * round trip on session_coordination (the reaper fixed by SD-FDBK-FIX-BUS-RETENTION-
 * CLEANUP-001 + QF-20260713-277). The function RAISE EXCEPTIONs on any archive/delete
 * count mismatch inside one transaction, so a row's mere existence in retention_archive
 * proves a matching DELETE also succeeded — this is stronger evidence than the sweep's
 * self-stamped periodic_process_registry witness (which stamps on every tick regardless
 * of whether the RPC itself succeeded).
 *
 * MEASURED-DECLINE GATE (GT-1 hard guard, SD-LEO-INFRA-L30-CLOSURE-EDGE-001): a real
 * edgeAt is supplied ONLY when the reaper has fired at least once (proving the mechanism
 * works) AND the CURRENT count of ELIGIBLE-FOR-DELETE rows is at or below
 * ELIGIBLE_BACKLOG_THRESHOLD — proving the backlog the reaper is actually responsible for
 * is under control right now, not just "the reaper ran" liveness. "Reaper ran" alone,
 * with that backlog still high, must NEVER produce edgeAt; that is exactly the
 * liveness-only false-CLOSE this system distrusts.
 *
 * "Eligible for delete" mirrors cleanup_expired_coordination's OWN delete predicate
 * exactly (database/migrations/20260713_fix_cleanup_expired_coordination_where_clause.sql):
 * expires_at < now() AND (acknowledged_at IS NOT NULL OR read_at <= now() - 7d). This is
 * deliberately NOT the raw `expires_at < now()` count: a live check against production
 * data during this SD's implementation showed raw-expired sitting at ~820 rows almost
 * entirely never-acked/never-read traffic that legitimately isn't reaper-eligible yet
 * (expired doesn't mean actionable — most coordination messages are read/acked well
 * before their 7-day dead-letter bar), while the eligible-for-delete subset measured 0-3
 * rows and visibly drained between two queries seconds apart. The raw count would make
 * EXPIRED_ROW_THRESHOLD-below-a-handful essentially unreachable in real fleet load and
 * would not actually measure THIS reaper's job; the eligible count is the correct,
 * responsive backlog signal and the one cleanup_expired_coordination itself targets.
 *
 * When a measured decline is confirmed, edgeAt is stamped with the collection instant
 * (not the archive round's timestamp): the claim being made is "as of THIS observation,
 * retention is caught up," re-derived fresh on every verifier run — exactly what the
 * edge_freshness predicate's own re-evaluate-against-now design (closure-engine.js)
 * expects. If the eligible backlog balloons again, the next run's edgeAt reverts to null
 * and the verdict decays back to OPEN through the same stateless mechanism, with no
 * separate decay logic needed here.
 */

const SOURCE_TABLE = 'session_coordination';
const ARCHIVED_BY = 'cleanup_expired_coordination';
const ELIGIBLE_BACKLOG_THRESHOLD = 5;
const DEAD_LETTER_WINDOW_MS = 7 * 86400 * 1000;

/**
 * @param {Object} supabase - service-role client
 * @returns {Promise<Object>} evidence: {} if never fired, else {upstreamFiredAt, edgeAt}
 *   edgeAt is a fresh ISO timestamp when a measured decline is confirmed, else null.
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

  const nowIso = new Date().toISOString();
  const deadLetterCutoffIso = new Date(Date.now() - DEAD_LETTER_WINDOW_MS).toISOString();

  const { count, error: countError } = await supabase
    .from(SOURCE_TABLE)
    .select('id', { count: 'exact', head: true })
    .lt('expires_at', nowIso)
    .or(`acknowledged_at.not.is.null,and(read_at.not.is.null,read_at.lte.${deadLetterCutoffIso})`);

  if (countError) {
    throw new Error(`session-coordination-retention collector: eligible-backlog count query failed: ${countError.message}`);
  }

  const measuredDecline = typeof count === 'number' && count <= ELIGIBLE_BACKLOG_THRESHOLD;

  return {
    upstreamFiredAt: latest.archived_at,
    edgeAt: measuredDecline ? nowIso : null,
  };
}
