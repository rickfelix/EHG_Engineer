/**
 * Durable governor-decision writer — FAIL-OPEN.
 * SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001 (FR-4)
 *
 * Writes one cost_governor_log row per governor decision (regen/tier/anomaly/tune).
 * Kept OUT of lib/cost/governor.js so the decision core stays I/O-free. Logging must
 * NEVER block or crash the governed work: any failure degrades to { ok:false, reason }
 * with a warning — it never throws.
 *
 * @module lib/cost/governor-log
 */

const DECISION_TYPES = new Set(['regen', 'tier', 'anomaly', 'tune']);
const MODES = new Set(['observe', 'enforce']);

/**
 * Normalize a caller-supplied decision into a valid cost_governor_log row.
 * Pure; safe to unit-test without a DB.
 *
 * @param {object} row { decisionType, action, targetKey, mode, measured, reason, thresholds }
 * @returns {object} a row matching the cost_governor_log column contract
 */
export function normalizeGovernorRow(row = {}) {
  const decision_type = DECISION_TYPES.has(row.decisionType) ? row.decisionType : 'anomaly';
  const mode = MODES.has(row.mode) ? row.mode : 'observe';
  return {
    decision_type,
    action: typeof row.action === 'string' ? row.action.slice(0, 64) : 'unknown',
    target_key: row.targetKey == null ? null : String(row.targetKey).slice(0, 256),
    mode,
    measured: row.measured && typeof row.measured === 'object' ? row.measured : {},
    reason: typeof row.reason === 'string' ? row.reason.slice(0, 2000) : '',
    thresholds: row.thresholds && typeof row.thresholds === 'object' ? row.thresholds : {},
  };
}

/**
 * Insert one governor decision. FAIL-OPEN: returns { ok:false, reason } on any
 * missing-client / DB error / throw — never rejects.
 *
 * @param {object} supabase a supabase-js client (or null)
 * @param {object} row      see normalizeGovernorRow
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function writeGovernorDecision(supabase, row) {
  if (!supabase || typeof supabase.from !== 'function') {
    return { ok: false, reason: 'no supabase client (fail-open — decision not persisted)' };
  }
  try {
    const { error } = await supabase.from('cost_governor_log').insert(normalizeGovernorRow(row));
    if (error) {
      console.warn('[governor-log] write failed (fail-open):', error.message);
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[governor-log] write threw (fail-open):', e?.message || e);
    return { ok: false, reason: e?.message || String(e) };
  }
}

export default { normalizeGovernorRow, writeGovernorDecision };
