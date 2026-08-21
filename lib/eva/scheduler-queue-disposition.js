/**
 * SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-3) — pure, read-only computation of the
 * "stale-active" eva_scheduler_queue disposition packet: rows linked to an 'active' eva_venture
 * whose dispatch_count is 0 and whose queue row is older than 30 days. This is a CHAIRMAN
 * decision (cancel as fixtures / re-arm / hold) — this module only computes and returns the
 * candidate list, it never cancels, purges, or re-arms anything.
 *
 * No DB writes. Mirrors the read-only shape of lib/eva/chairman-product-review.js's
 * generateReviewPacket.
 */

export const STALE_ACTIVE_MIN_AGE_DAYS = 30;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ now?: Date, minAgeDays?: number }} [opts]
 * @returns {Promise<{ generatedAt: string, cutoffIso: string, minAgeDays: number, rows: Array<{ ventureId: string, ventureName: string, createdAt: string, dispatchCount: number }> }>}
 */
export async function computeStaleActiveQueueDisposition(supabase, { now = new Date(), minAgeDays = STALE_ACTIVE_MIN_AGE_DAYS } = {}) {
  const cutoff = new Date(now.getTime() - minAgeDays * 86_400_000).toISOString();

  const { data: queueRows, error: qErr } = await supabase
    .from('eva_scheduler_queue')
    .select('venture_id, created_at, dispatch_count')
    .eq('status', 'pending')
    .eq('dispatch_count', 0)
    .lt('created_at', cutoff);
  if (qErr) throw new Error(`eva_scheduler_queue query failed: ${qErr.message}`);
  if (!queueRows || queueRows.length === 0) {
    return { generatedAt: now.toISOString(), cutoffIso: cutoff, minAgeDays, rows: [] };
  }

  const ventureIds = [...new Set(queueRows.map((r) => r.venture_id))];
  const { data: ventures, error: vErr } = await supabase
    .from('eva_ventures')
    .select('id, name, status')
    .in('id', ventureIds)
    .eq('status', 'active');
  if (vErr) throw new Error(`eva_ventures query failed: ${vErr.message}`);
  const activeById = new Map((ventures || []).map((v) => [v.id, v]));

  const rows = queueRows
    .filter((r) => activeById.has(r.venture_id))
    .map((r) => ({
      ventureId: r.venture_id,
      ventureName: activeById.get(r.venture_id).name,
      createdAt: r.created_at,
      dispatchCount: r.dispatch_count,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  return { generatedAt: now.toISOString(), cutoffIso: cutoff, minAgeDays, rows };
}

/** Plain-text rendering for the chairman packet — deterministic, no side effects. */
export function renderStaleActiveQueuePacket(packet) {
  const lines = [
    `EVA Scheduler Queue — Stale-Active Disposition Packet (generated ${packet.generatedAt})`,
    `${packet.rows.length} row(s): pending, dispatch_count=0, older than ${packet.minAgeDays} days (cutoff ${packet.cutoffIso})`,
    'Decision needed: cancel as fixtures / re-arm / hold. Not acted on automatically.',
    '',
  ];
  for (const r of packet.rows) {
    lines.push(`  - ${r.ventureName} (${r.ventureId}) — created ${r.createdAt}, dispatch_count ${r.dispatchCount}`);
  }
  return lines.join('\n');
}
