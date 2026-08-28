// SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-2): pure burn-slope projection over
// account_usage_pastes rows. Never fabricates a slope from fewer than 2 rows, and never
// confuses a query failure with genuine insufficient data (TS-6).

'use strict';

const TABLE = 'account_usage_pastes';

const METERS = {
  session: { pctColumn: 'session_pct', resetColumn: 'session_reset_at' },
  week_all_models: { pctColumn: 'week_all_models_pct', resetColumn: 'week_reset_at' },
  week_fable: { pctColumn: 'week_fable_pct', resetColumn: 'week_reset_at' },
};

const VERDICTS = {
  CONFIDENT_EXHAUSTS_BEFORE_RESET: 'CONFIDENT_EXHAUSTS_BEFORE_RESET',
  CONFIDENT_OK: 'CONFIDENT_OK',
  CONFIDENT_NO_RISK: 'CONFIDENT_NO_RISK',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
};

function assertValidMeter(meter) {
  if (!METERS[meter]) {
    throw new Error(`account-usage-burn-projection: invalid meter '${meter}' (expected one of ${Object.keys(METERS).join(', ')})`);
  }
}

/**
 * Project burn for one account/meter from the 2 most recent account_usage_pastes rows.
 *
 * @param {string} accountUuid8
 * @param {'session'|'week_all_models'|'week_fable'} meter
 * @param {{supabase:object}} opts
 * @returns {Promise<object>} one of:
 *   { verdict: 'DATA_UNAVAILABLE', error }
 *   { verdict: 'INSUFFICIENT_DATA', rows_available: 0|1 }
 *   { verdict: 'CONFIDENT_NO_RISK'|'CONFIDENT_OK'|'CONFIDENT_EXHAUSTS_BEFORE_RESET',
 *     slope_pct_per_day, projected_exhaustion_at, reset_at, row_ids: [olderId, newerId] }
 */
async function projectBurn(accountUuid8, meter, opts = {}) {
  assertValidMeter(meter);
  if (!opts.supabase) throw new Error('account-usage-burn-projection: supabase client is required');
  const { pctColumn, resetColumn } = METERS[meter];

  // Design invariant: account_uuid8 is the sole identity predicate. Never substitute
  // account_org_name/email -- a rebind here silently merges two accounts' slopes (FR-5).
  const { data, error } = await opts.supabase
    .from(TABLE)
    .select(`id, pasted_at, ${pctColumn}, ${resetColumn}`)
    .eq('account_uuid8', accountUuid8)
    .order('pasted_at', { ascending: false })
    .limit(2);

  if (error) {
    return { verdict: VERDICTS.DATA_UNAVAILABLE, error: error.message };
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length < 2) {
    return { verdict: VERDICTS.INSUFFICIENT_DATA, rows_available: rows.length };
  }

  const [newer, older] = rows; // ordered descending by pasted_at
  const newerPct = newer[pctColumn];
  const olderPct = older[pctColumn];
  if (!Number.isFinite(newerPct) || !Number.isFinite(olderPct)) {
    // A NULL meter reading on either row is not "2 rows of data for THIS meter" -- treat it as
    // insufficient rather than computing a slope against a missing number.
    return { verdict: VERDICTS.INSUFFICIENT_DATA, rows_available: rows.length };
  }

  const daysBetween = (new Date(newer.pasted_at).getTime() - new Date(older.pasted_at).getTime()) / 86400000;
  if (!(daysBetween > 0)) {
    return { verdict: VERDICTS.INSUFFICIENT_DATA, rows_available: rows.length };
  }

  const slopePctPerDay = (newerPct - olderPct) / daysBetween;
  const resetAt = newer[resetColumn] || older[resetColumn] || null;
  const rowIds = [older.id, newer.id];

  if (slopePctPerDay <= 0) {
    return {
      verdict: VERDICTS.CONFIDENT_NO_RISK,
      slope_pct_per_day: slopePctPerDay,
      reset_at: resetAt,
      row_ids: rowIds,
    };
  }

  const daysToExhaustion = (100 - newerPct) / slopePctPerDay;
  const projectedExhaustionAt = new Date(new Date(newer.pasted_at).getTime() + daysToExhaustion * 86400000).toISOString();

  const exhaustsBeforeReset = resetAt ? new Date(projectedExhaustionAt).getTime() < new Date(resetAt).getTime() : false;

  return {
    verdict: exhaustsBeforeReset ? VERDICTS.CONFIDENT_EXHAUSTS_BEFORE_RESET : VERDICTS.CONFIDENT_OK,
    slope_pct_per_day: slopePctPerDay,
    projected_exhaustion_at: projectedExhaustionAt,
    reset_at: resetAt,
    row_ids: rowIds,
  };
}

module.exports = { projectBurn, VERDICTS, METERS };
