/**
 * Daily post-hoc sampling audit — SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-8).
 *
 * Verifies the self-improvement loop (Solomon batch-read riders folded into next-batch
 * standards) is actually happening, rather than merely asserted: samples >=2 QFs that FLOWED
 * (reached a terminal, non-held state) in the trailing lookback window and records their ids in
 * a durable audit row. Reuses the EXISTING adam_adherence_ledger table (probe/duty/verdict/
 * detail/remediation_ref/created_at) rather than adding a new table — this SD's own
 * reuse-not-rebuild theme.
 */
import { randomUUID as nodeRandomUUID } from 'node:crypto';

export const SAMPLING_AUDIT_PROBE = 'oracle_read_pending_sample';
export const MIN_SAMPLE_SIZE = 2;

/**
 * Pure: pick a deterministic sample of >= MIN_SAMPLE_SIZE flowed QF ids from already-fetched rows
 * (most-recently-completed first). Returns fewer than MIN_SAMPLE_SIZE only when the population
 * itself is smaller — never pads with fabricated ids.
 * @param {Array<{id:string, status:string, updated_at?:string}>} flowedQfs
 * @param {number} [sampleSize]
 */
export function pickSample(flowedQfs, sampleSize = MIN_SAMPLE_SIZE) {
  const sorted = [...(flowedQfs || [])]
    .filter((q) => q && q.id)
    .sort((a, b) => (Date.parse(b.updated_at || 0) || 0) - (Date.parse(a.updated_at || 0) || 0));
  return sorted.slice(0, sampleSize).map((q) => q.id);
}

/**
 * DB-fetching wrapper: samples recently-completed QFs (status in a terminal-flowed set) from the
 * trailing lookback window.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function sampleFlowedItems(supabaseClient, { lookbackMs = 24 * 60 * 60 * 1000, nowMs = Date.now(), sampleSize = MIN_SAMPLE_SIZE } = {}) {
  const sinceIso = new Date(nowMs - lookbackMs).toISOString();
  // TESTING finding D-1: quick_fixes has NO updated_at column (measured live) — completed_at is
  // the actual "flowed" timestamp. Mapped onto pickSample's generic `updated_at` ranking key below
  // rather than renaming that pure function's param (it is intentionally table-agnostic).
  const { data, error } = await supabaseClient
    .from('quick_fixes')
    .select('id, status, completed_at')
    .eq('status', 'completed')
    .gte('completed_at', sinceIso)
    .order('completed_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`sampleFlowedItems: ${error.message}`);
  const rows = (data || []).map((r) => ({ id: r.id, updated_at: r.completed_at }));
  return pickSample(rows, sampleSize);
}

/**
 * Records the sample as a durable audit row (adam_adherence_ledger reuse). verdict is 'pass' when
 * the sample met MIN_SAMPLE_SIZE, 'unknown' when the population itself was too small to sample
 * from — never a fabricated 'pass' on a genuinely empty day.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string[]} sampledIds
 */
export async function recordSamplingAudit(supabaseClient, sampledIds, { randomUUID = nodeRandomUUID } = {}) {
  const verdict = (sampledIds || []).length >= MIN_SAMPLE_SIZE ? 'pass' : 'unknown';
  const { error } = await supabaseClient.from('adam_adherence_ledger').insert({
    run_id: randomUUID(),
    probe: SAMPLING_AUDIT_PROBE,
    duty: SAMPLING_AUDIT_PROBE,
    verdict,
    detail: `sampled ${(sampledIds || []).length} flowed QF(s): ${(sampledIds || []).join(', ') || 'none'}`,
    remediation_ref: null,
  });
  if (error) return { recorded: false, error: error.message };
  return { recorded: true, verdict, count: (sampledIds || []).length };
}

/** Composed daily job: sample then record. */
export async function runDailySamplingAudit(supabaseClient, opts = {}) {
  const sampledIds = await sampleFlowedItems(supabaseClient, opts);
  return recordSamplingAudit(supabaseClient, sampledIds);
}

export default { SAMPLING_AUDIT_PROBE, MIN_SAMPLE_SIZE, pickSample, sampleFlowedItems, recordSamplingAudit, runDailySamplingAudit };
