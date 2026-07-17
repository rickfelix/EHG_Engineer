/**
 * SMS spend-envelope caps + the atomic-debit helper.
 * SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B (FR-2).
 *
 * Caps are CHAIRMAN-TUNABLE VIA CONFIG, not code: the defaults below are overridden by
 * process.env (SMS_PER_DECISION_CAP_USD / SMS_DAILY_CAP_USD / SMS_UNDO_WINDOW_MS) when set
 * to a valid non-negative number. A malformed/blank override falls back to the default
 * (never silently widens the cap to 0/NaN). These flow as PARAMETERS into the
 * debit_sms_daily_spend RPC, which is the sole authority on approve/over-cap — the numbers
 * are never re-derived or hardcoded inside the consume seam.
 *
 * @module lib/chairman/sms-spend-caps
 */

/**
 * Read a non-negative numeric env override, else the fallback. A blank/absent/NaN/negative
 * value yields the fallback (fail-safe: an operator cannot accidentally zero or corrupt a cap
 * with a typo — it just reverts to the documented default).
 * @param {string} envName
 * @param {number} fallback
 * @returns {number}
 * @private
 */
function readNonNegativeNumberEnv(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Per-decision spend cap (USD). A single-value check inside the RPC. Default $250. */
export const PER_DECISION_CAP_USD = readNonNegativeNumberEnv('SMS_PER_DECISION_CAP_USD', 250);

/** Daily-cumulative spend cap (USD). Enforced atomically by the SUM-check RPC. Default $500. */
export const DAILY_CAP_USD = readNonNegativeNumberEnv('SMS_DAILY_CAP_USD', 500);

/** Undo window (ms) stamped on a spend reply; consume is inert until it elapses. Default 15m. */
export const UNDO_WINDOW_MS = readNonNegativeNumberEnv('SMS_UNDO_WINDOW_MS', 15 * 60 * 1000);

/**
 * Call the atomic per-decision + daily-cumulative cap-debit RPC.
 * FAIL-CLOSED: any RPC error, or an inserted-row-count < 1, is NOT approved (routes the
 * caller to console) — a spend is approved ONLY on an explicit inserted-row-count of 1.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service_role client
 * @param {{decisionId: string, amount: number, perDecisionCap?: number, dailyCap?: number}} opts
 * @returns {Promise<{approved: boolean, error?: string}>}
 */
export async function debitSmsDailySpend(
  supabase,
  { decisionId, amount, perDecisionCap = PER_DECISION_CAP_USD, dailyCap = DAILY_CAP_USD }
) {
  try {
    const { data, error } = await supabase.rpc('debit_sms_daily_spend', {
      p_decision_id: decisionId,
      p_amount: amount,
      p_per_decision_cap: perDecisionCap,
      p_daily_cap: dailyCap,
    });
    if (error) return { approved: false, error: error.message };
    // The RPC returns a scalar int (1 = approved, 0 = over-cap). Supabase surfaces a scalar
    // RETURNS as the bare value in `data`.
    const inserted = Array.isArray(data) ? Number(data[0]) : Number(data);
    return { approved: Number.isFinite(inserted) && inserted >= 1 };
  } catch (e) {
    // Any unexpected throw -> fail-closed (never approve on uncertainty).
    return { approved: false, error: e?.message || String(e) };
  }
}

export default { PER_DECISION_CAP_USD, DAILY_CAP_USD, UNDO_WINDOW_MS, debitSmsDailySpend };
