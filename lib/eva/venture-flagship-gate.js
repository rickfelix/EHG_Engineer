/**
 * Venture Flagship Gate — governed re-measure writer. QF-20260912-366.
 * Re-stamps the row's EXISTING venture_gate_last_* fields (no new field) via the atomic merge
 * helper. Criterion, unchanged from the 2026-07-28 check: >=1 `ventures` row not cancelled AND
 * carrying a non-empty deployment_url.
 */
import { mergeMetadataKeys } from '../coordinator/safe-metadata-merge.mjs';
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import { createLogger } from '../logger.js';

const logger = createLogger('VentureFlagshipGate');

/** PURE: compute the verdict from a live ventures snapshot. */
export function computeVentureFlagshipVerdict(ventureRows = []) {
  const rows = Array.isArray(ventureRows) ? ventureRows : [];
  const qualifying = rows.filter((v) => v.status !== 'cancelled' && v.deployment_url && String(v.deployment_url).trim() !== '');
  const verdict = qualifying.length > 0 ? 'MET' : 'NOT_MET';
  const detail = `of ${rows.length} venture rows, ${qualifying.length} carry a non-empty deployment_url and are not cancelled.`
    + (qualifying.length ? ` Qualifying: ${qualifying.map((v) => v.name).join(', ')}.` : '');
  return { verdict, detail, qualifyingCount: qualifying.length, totalCount: rows.length };
}

/** I/O: re-measure and merge onto one SD row via the atomic JSONB helper (never full-blob). */
export async function remeasureVentureFlagshipGate(supabase, sdKey, { checkedBy, now = new Date() } = {}) {
  if (!checkedBy) throw new Error('remeasureVentureFlagshipGate: checkedBy is required');
  const rows = await fetchAllPaginated(() => supabase.from('ventures').select('id,name,status,deployment_url'));
  const { verdict, detail } = computeVentureFlagshipVerdict(rows);
  const checkedAt = now.toISOString();
  const patch = {
    venture_gate_last_verdict: verdict,
    venture_gate_last_evidence: `Checked ${checkedAt}: ${detail}`,
    venture_gate_last_checked_at: checkedAt,
    venture_gate_last_checked_by: checkedBy,
  };
  const result = await mergeMetadataKeys(sdKey, patch, {
    writer: 'venture-flagship-gate-remeasure',
    reason: 'QF-20260912-366 governed re-measure of the flagship deployment gate',
  });
  logger.info('Venture flagship gate re-measured', { sdKey, verdict, merged: result.merged });
  return { ...result, verdict };
}
