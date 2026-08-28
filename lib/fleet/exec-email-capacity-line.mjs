// exec-email-capacity-line.mjs
// SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-3) — the chairman-facing account-usage burn-projection
// line, shared VERBATIM by the two surfaces that render it: Adam's 6 AM ET morning-brief action
// list (scripts/adam-exec-summary.mjs, conditional entry only) and the manual 21:30 ET presleep
// forecast duty (scripts/account-usage-paste-projection.mjs). ONE projection call, ONE formatter
// per surface, so the two CANNOT disagree in one day (mirrors exec-email-drive-line.mjs's `io.supabase`
// convention: PURE where possible, FAIL-SOFT everywhere -- composeCapacityAdvisoryLine() never throws).

import { projectBurn, VERDICTS } from './account-usage-burn-projection.cjs';

const METER_LABELS = {
  session: 'Session',
  week_all_models: 'Week all-models',
  week_fable: 'Week Fable',
};

function fmtDate(iso) {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short',
  });
}

function hoursBetween(a, b) {
  return Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3600000);
}

/**
 * FR-3 / testing-agent finding: the conditional morning-brief line. Returns null when there is
 * no active exhaustion-before-reset risk for this account/meter (INSUFFICIENT_DATA,
 * DATA_UNAVAILABLE, CONFIDENT_OK, and CONFIDENT_NO_RISK all render nothing) -- a permanent
 * headline number is explicitly out of scope (standing 2026-06-14 chairman directive on
 * scripts/adam-exec-summary.mjs). On a read failure this renders the caller-visible
 * "(unavailable this run)" text rather than degrading to null, so an absent advisory is never
 * indistinguishable from an absent risk (DESIGN sub-agent 7b40b8a4 correction).
 *
 * @param {string} accountUuid8
 * @param {'session'|'week_all_models'|'week_fable'} meter
 * @param {{ supabase: object }} io
 * @returns {Promise<{ line: string, rowIds: number[] } | null>}
 */
export async function composeCapacityAdvisoryLine(accountUuid8, meter, io) {
  const db = io && io.supabase;
  if (!db) return null;
  let projection;
  try {
    projection = await projectBurn(accountUuid8, meter, { supabase: db });
  } catch {
    return { line: `Capacity: (unavailable this run)`, rowIds: [] };
  }

  if (projection.verdict === VERDICTS.DATA_UNAVAILABLE) {
    return { line: `Capacity: (unavailable this run)`, rowIds: [] };
  }
  if (projection.verdict !== VERDICTS.CONFIDENT_EXHAUSTS_BEFORE_RESET) {
    return null; // no active risk -- silent by default, not a permanent headline
  }

  const label = METER_LABELS[meter] || meter;
  const hrs = hoursBetween(projection.projected_exhaustion_at, projection.reset_at);
  return {
    line: `${label} capacity exhausts ~${fmtDate(projection.projected_exhaustion_at)}, ` +
      `BEFORE reset ${fmtDate(projection.reset_at)} (${hrs}h early). ` +
      `[ref usage_projection:${projection.row_ids.join(',')}]`,
    rowIds: projection.row_ids,
  };
}

/**
 * The manual 21:30 ET presleep-duty CLI report: terse, terminal/SMS-legible text covering EVERY
 * verdict (unlike the morning-brief line above, which is silent on non-risk verdicts). Never
 * prints a %/day, ETA, or slope in the insufficient-data/data-unavailable branches.
 *
 * @param {string} accountUuid8
 * @param {'session'|'week_all_models'|'week_fable'} meter
 * @param {{ supabase: object }} io
 * @returns {Promise<string>}
 */
export async function composeCapacityCliReport(accountUuid8, meter, io) {
  const db = io && io.supabase;
  const label = METER_LABELS[meter] || meter;
  if (!db) return `${label}: (unavailable this run)`;

  let projection;
  try {
    projection = await projectBurn(accountUuid8, meter, { supabase: db });
  } catch (e) {
    return `${label}: (unavailable this run — ${e.message})`;
  }

  if (projection.verdict === VERDICTS.DATA_UNAVAILABLE) {
    return `${label}: (unavailable this run — ${projection.error})`;
  }
  if (projection.verdict === VERDICTS.INSUFFICIENT_DATA) {
    return `${label}: INSUFFICIENT DATA -- ${projection.rows_available} paste on file (need 2+). Paste /usage again.`;
  }

  const slope = Math.round(projection.slope_pct_per_day * 10) / 10;
  const rows = `Rows: ${projection.row_ids.join(',')}`;

  if (projection.verdict === VERDICTS.CONFIDENT_NO_RISK) {
    return `${label}: no upward trend (slope ${slope}%/day). ${rows}`;
  }

  const resetLine = `Resets: ${fmtDate(projection.reset_at)}`;
  if (projection.verdict === VERDICTS.CONFIDENT_EXHAUSTS_BEFORE_RESET) {
    const hrs = hoursBetween(projection.projected_exhaustion_at, projection.reset_at);
    return `${label}: -> 100% on ${fmtDate(projection.projected_exhaustion_at)}\n` +
      `${resetLine} -- EXHAUSTS ${hrs}h BEFORE reset\n` +
      `Slope ${slope}%/day. ${rows}`;
  }

  // CONFIDENT_OK
  return `${label}: -> 100% on ${fmtDate(projection.projected_exhaustion_at)}\n` +
    `${resetLine} -- OK (exhausts after reset)\n` +
    `Slope ${slope}%/day. ${rows}`;
}

export default { composeCapacityAdvisoryLine, composeCapacityCliReport };
