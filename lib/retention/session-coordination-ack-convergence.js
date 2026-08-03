/**
 * ack-TTL convergence for session_coordination (SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 FR-2).
 *
 * cleanup_expired_coordination()'s fixed guard predicate only deletes expired rows that are
 * acknowledged, or read >=7 days ago -- it never deletes never-surfaced rows. Rows that were
 * read (or never even read) but never acknowledged accumulate until they age out on their own.
 * This convergence pass stamps acknowledged_at (+ payload.auto_acked=true) on rows unacked for
 * >=14 days, so the cleanup RPC's guard predicate can eventually reap them once they also
 * expire. It deletes nothing.
 */

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — this convergence pass ACTS
// (stamps acknowledged_at) on every unacked-past-cutoff session_coordination row; a read
// silently capped at the PostgREST 1000-row max would leave older backlog rows un-converged
// forever. session_coordination is a growing table, so paginate the candidate read.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import { createRequire } from 'module';
// SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-8): the marker this pass must not converge over.
const { PROMOTION_ACK_KEY } = createRequire(import.meta.url)('../coordinator/promotion-ack.cjs');

const ACK_TTL_DAYS = 14;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ converged: number, error: string|null }>}
 */
export async function convergeAckTTL(supabase, { now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - ACK_TTL_DAYS * 86_400_000).toISOString();

  let candidates;
  try {
    candidates = await fetchAllPaginated(() => supabase
      .from('session_coordination')
      .select('id, payload')
      .is('acknowledged_at', null)
      .lte('created_at', cutoff)
      // SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-8, second site). This pass is the SIBLING of the
      // STUCK-drain in stale-session-sweep.cjs — both called from the same main(), ~100 lines
      // apart, both stamping acknowledged_at on rows selected by a bare `acknowledged_at IS NULL`.
      // Guarding one and not the other would have left the fix self-reverting on a longer fuse.
      //
      // AND THE ROUTER FIX IS WHAT CREATES THE EXPOSURE HERE. Before it, promoted signals were
      // acked on the spot and never reached this candidate set at all. Now promotion deliberately
      // leaves acknowledged_at NULL, so EVERY promoted signal sits here until ACK_TTL_DAYS and is
      // then stamped to ack-SET / read-NULL / promotion_ack — which is precisely the swallowed
      // state the SD exists to abolish, reached 14 days later instead of instantly, and destroyed
      // by cleanup_expired_coordination on the next tick.
      //
      // A promoted row is filed and awaiting disposition, not an unacked row rotting in the lane,
      // so TTL convergence is the wrong instrument for it.
      .is(`payload->>${PROMOTION_ACK_KEY}`, null)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (selErr) {
    return { converged: 0, error: `select failed: ${selErr.message}` };
  }
  if (!candidates || candidates.length === 0) return { converged: 0, error: null };

  let converged = 0;
  for (const row of candidates) {
    const { error: updErr } = await supabase
      .from('session_coordination')
      .update({
        acknowledged_at: now.toISOString(),
        payload: { ...(row.payload || {}), auto_acked: true },
      })
      .eq('id', row.id);
    if (updErr) return { converged, error: `update failed for id=${row.id}: ${updErr.message}` };
    converged += 1;
  }

  return { converged, error: null };
}
