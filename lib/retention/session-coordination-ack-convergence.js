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

const ACK_TTL_DAYS = 14;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ converged: number, error: string|null }>}
 */
export async function convergeAckTTL(supabase, { now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - ACK_TTL_DAYS * 86_400_000).toISOString();

  const { data: candidates, error: selErr } = await supabase
    .from('session_coordination')
    .select('id, payload')
    .is('acknowledged_at', null)
    .lte('created_at', cutoff);

  if (selErr) return { converged: 0, error: `select failed: ${selErr.message}` };
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
