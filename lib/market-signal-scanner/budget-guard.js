/**
 * Market Signal Scanner — FinOps Budget Guard
 * SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 (FR-5)
 *
 * Scanner-scoped monthly FinOps ceiling ($25/mo default). Modeled on
 * lib/marketing/budget-governor.js's SHAPE (checkBudget/recordSpend/
 * getBudgetSummary) but deliberately NOT coupled to the marketing domain's
 * channel_budgets table (that table is keyed by venture_id + platform and
 * carries daily-stop-loss semantics this scanner doesn't need). This guard
 * reads/writes its own `market_signal_scanner_budget` table, keyed by
 * month_key only — one row per calendar month, no per-venture/per-platform
 * dimension, because the scanner runs as a single shared periodic process,
 * not per-venture.
 *
 * Since all v1 sources (Reddit, Google Trends, WordPress plugins) are $0
 * direct-cost APIs, the $25/mo ceiling here is effectively a compute/LLM-
 * adjudication budget (e.g. any LLM calls used for complaint-mining text
 * classification), not a data-acquisition budget. A future paid-tier source
 * (Keepa, Meta Ad Library) must share this same ceiling, not introduce a
 * second one.
 *
 * --- Fail-closed vs. auto-provision (deliberate divergence, documented) ---
 * lib/marketing/budget-governor.js fails closed on a missing budget row
 * (`allowed: false`) because in that domain a missing row means budgeting
 * was never configured for that venture/platform — spend would be
 * unbounded/untracked if allowed through.
 *
 * This guard does NOT mirror that behavior literally. There is exactly one
 * scanner, running on a fixed monthly cron, with one well-known default cap.
 * A missing row here just means "first cycle of a new calendar month" — a
 * routine, expected state, not a misconfiguration. Treating it as a hard
 * block would brick the scanner every month-rollover until a human manually
 * inserts a row, which defeats the point of an autonomous periodic process.
 *
 * So checkBudget() auto-provisions a fresh row at the DEFAULT_CAP_USD cap
 * (spent_usd: 0) the first time a given month_key is seen, then evaluates
 * normally against that row. This is still "fail closed" in the sense that
 * matters: the cap is never widened or bypassed, spend is never left
 * untracked, and once the row exists the same over-cap logic as any other
 * month applies. It is simply closed against *unbounded* spend, not closed
 * against *any* spend on an unconfigured month.
 */

const DEFAULT_CAP_USD = 25;
const TABLE = 'market_signal_scanner_budget';

/**
 * @param {object} params
 * @param {object} params.supabase - Supabase client (service-role)
 * @param {string} params.monthKey - e.g. '2026-07'
 * @returns {Promise<{ allowed: boolean, spentUsd: number, capUsd: number, reason: string|null }>}
 */
export async function checkBudget({ supabase, monthKey }) {
  if (!supabase) throw new Error('checkBudget: supabase client is required');
  if (!monthKey) throw new Error('checkBudget: monthKey is required');

  let row = await getRow(supabase, monthKey);

  if (!row) {
    row = await createDefaultRow(supabase, monthKey);
  }

  const spentUsd = Number(row.spent_usd);
  const capUsd = Number(row.cap_usd);

  if (spentUsd >= capUsd) {
    return {
      allowed: false,
      spentUsd,
      capUsd,
      reason: `Monthly FinOps cap exceeded for ${monthKey}: $${spentUsd}/$${capUsd}`,
    };
  }

  return { allowed: true, spentUsd, capUsd, reason: null };
}

/**
 * Records a spend event against the given month, creating the row (at the
 * default cap) if this is the first spend seen for that month.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.monthKey
 * @param {number} params.amountUsd
 * @returns {Promise<number>} the new spent_usd total for the month
 */
export async function recordSpend({ supabase, monthKey, amountUsd }) {
  if (!supabase) throw new Error('recordSpend: supabase client is required');
  if (!monthKey) throw new Error('recordSpend: monthKey is required');
  if (!Number.isFinite(amountUsd) || amountUsd < 0) {
    throw new Error('recordSpend: amountUsd must be a non-negative finite number');
  }

  let row = await getRow(supabase, monthKey);
  if (!row) {
    row = await createDefaultRow(supabase, monthKey);
  }

  const newSpent = Number(row.spent_usd) + amountUsd;

  const { data, error } = await supabase
    .from(TABLE)
    .update({ spent_usd: newSpent, updated_at: new Date().toISOString() })
    .eq('month_key', monthKey)
    .select('spent_usd')
    .single();

  if (error) {
    throw new Error(`recordSpend: failed to update ${TABLE} for ${monthKey}: ${error.message}`);
  }

  return Number(data.spent_usd);
}

/**
 * Get a summary of budget utilization across all tracked months.
 * @param {object} supabase
 * @returns {Promise<Array<{ monthKey: string, spentUsd: number, capUsd: number, utilizationPct: number }>>}
 */
export async function getBudgetSummary(supabase) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('month_key', { ascending: false });

  if (error) {
    throw new Error(`getBudgetSummary: failed to read ${TABLE}: ${error.message}`);
  }

  return (data || []).map((row) => ({
    monthKey: row.month_key,
    spentUsd: Number(row.spent_usd),
    capUsd: Number(row.cap_usd),
    utilizationPct: Number(row.cap_usd) > 0
      ? Math.round((Number(row.spent_usd) / Number(row.cap_usd)) * 100)
      : 0,
  }));
}

async function getRow(supabase, monthKey) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('month_key', monthKey)
    .maybeSingle();

  if (error) {
    throw new Error(`checkBudget: failed to read ${TABLE} for ${monthKey}: ${error.message}`);
  }

  return data || null;
}

async function createDefaultRow(supabase, monthKey) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ month_key: monthKey, spent_usd: 0, cap_usd: DEFAULT_CAP_USD })
    .select('*')
    .single();

  if (error) {
    throw new Error(`checkBudget: failed to auto-provision ${TABLE} row for ${monthKey}: ${error.message}`);
  }

  return data;
}

export { DEFAULT_CAP_USD };
