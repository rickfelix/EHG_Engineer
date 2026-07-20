/**
 * rung-health-convergence.mjs — feedback-loop CONVERGENCE indicator (FR-5 of
 * SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001).
 *
 * The rung-progress rollup (lib/vision/rung-progress-rollup.mjs, FR-1) shows HOW FULL each rung
 * is. This adds a rung-HEALTH signal: are the governance feedback loops CONVERGING (Adam's
 * self-adherence catches trending toward zero — the D3 "reviewer_not_safetynet, catches trend
 * toward zero as it matures" goal) or CHURNING (flat/rising catch rate)? A maturing loop catches
 * less over time; a stuck loop keeps catching the same class.
 *
 * Source: adam_adherence_ledger (verdict='fail' rows; 20260614_adam_adherence_ledger.sql). Pure
 * compute is separated from the fail-soft DB read so it is unit-testable without a DB.
 */

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — fail rows in the window are bucketed
// per-day to compute the catch-rate slope; a read silently capped at the PostgREST 1000-row max
// would undercount catches and skew the convergence trend. Paginate to completion (fail-soft: []).
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure: compute a catch-rate convergence indicator from adherence-ledger fail rows.
 * @param {Array<{created_at: string, verdict?: string}>} rows  ledger rows (any verdict; only 'fail' counts)
 * @param {{nowMs: number, windowDays?: number}} opts  nowMs is REQUIRED (inject — scripts can't call Date.now in some sandboxes)
 * @returns {{
 *   windowDays:number, samples:number, totalCatches:number, catchRatePerDay:number,
 *   slopePerDay:number, trend:'converging'|'flat'|'diverging'|'insufficient_data',
 *   converging:boolean|null, daysToZero:number|null
 * }}
 */
export function computeCatchRateConvergence(rows, { nowMs, windowDays = 14 } = {}) {
  if (!Number.isFinite(nowMs)) throw new Error('computeCatchRateConvergence: nowMs (number) required');
  const wd = Math.max(2, Math.floor(windowDays));
  const windowStart = nowMs - wd * DAY_MS;

  // Bucket FAIL catches into per-day counts (day 0 = oldest in-window day .. day wd-1 = today).
  const fails = (Array.isArray(rows) ? rows : []).filter((r) => {
    if (!r || (r.verdict && r.verdict !== 'fail')) return false;
    const t = Date.parse(r.created_at);
    return Number.isFinite(t) && t >= windowStart && t <= nowMs;
  });
  const buckets = new Array(wd).fill(0);
  for (const r of fails) {
    const t = Date.parse(r.created_at);
    let idx = Math.floor((t - windowStart) / DAY_MS);
    if (idx < 0) idx = 0;
    if (idx >= wd) idx = wd - 1;
    buckets[idx] += 1;
  }

  const totalCatches = buckets.reduce((a, b) => a + b, 0);
  const catchRatePerDay = totalCatches / wd;

  // Need at least 2 days WITH any activity to call a trend; else insufficient_data.
  const activeDays = buckets.filter((b) => b > 0).length;
  if (totalCatches === 0 || activeDays < 2) {
    return {
      windowDays: wd, samples: totalCatches, totalCatches, catchRatePerDay,
      slopePerDay: 0,
      trend: totalCatches === 0 ? 'converging' : 'insufficient_data',
      converging: totalCatches === 0 ? true : null,
      daysToZero: totalCatches === 0 ? 0 : null,
    };
  }

  // Trim LEADING empty days (before the first catch) — they predate any activity and would
  // falsely read as "rising from zero". TRAILING zeros (recent quiet days) are KEPT: a burst that
  // has gone quiet is exactly the convergence signal we want to detect.
  const firstActive = buckets.findIndex((b) => b > 0);
  const series = buckets.slice(firstActive);

  // Least-squares slope of daily catch counts vs day index (catches/day change per day).
  const n = series.length;
  const xs = series.map((_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - meanX) * (series[i] - meanY); den += (xs[i] - meanX) ** 2; }
  const slopePerDay = den === 0 ? 0 : num / den;

  // Converging = catches trending DOWN (negative slope beyond a small flat band).
  const FLAT_BAND = 0.05; // catches/day/day — below this magnitude is "flat"
  let trend, converging;
  if (slopePerDay < -FLAT_BAND) { trend = 'converging'; converging = true; }
  else if (slopePerDay > FLAT_BAND) { trend = 'diverging'; converging = false; }
  else { trend = 'flat'; converging = false; }

  // Linear ETA to zero from today's modeled level (only meaningful when converging).
  let daysToZero = null;
  if (converging) {
    const todayLevel = meanY + slopePerDay * (n - 1 - meanX); // regression value at last day
    if (todayLevel > 0) daysToZero = Math.ceil(todayLevel / -slopePerDay);
    else daysToZero = 0;
  }

  return {
    windowDays: wd, samples: totalCatches, totalCatches,
    catchRatePerDay: Math.round(catchRatePerDay * 100) / 100,
    slopePerDay: Math.round(slopePerDay * 1000) / 1000,
    trend, converging, daysToZero,
  };
}

/**
 * One-line human summary for the exec-summary email / rollup readout (FR-4 consumes this).
 */
export function formatConvergenceLine(c) {
  if (!c) return 'feedback-loop health: unknown';
  if (c.trend === 'converging' && c.totalCatches === 0) return 'feedback loops CONVERGING — 0 catches in window (mature/quiet)';
  if (c.trend === 'insufficient_data') return `feedback-loop health: insufficient data (${c.totalCatches} catch(es), need ≥2 active days)`;
  const eta = c.daysToZero != null ? `, ~${c.daysToZero}d to zero` : '';
  const verb = c.trend === 'converging' ? 'CONVERGING' : c.trend === 'diverging' ? 'DIVERGING (churning)' : 'FLAT (churning)';
  return `feedback loops ${verb} — ${c.catchRatePerDay}/day, slope ${c.slopePerDay}/day${eta} (${c.totalCatches} catch(es)/${c.windowDays}d)`;
}

/**
 * Fail-soft DB read: load adherence-ledger rows in the window. Returns [] on any error (table
 * absent/unreadable) so the indicator degrades to insufficient_data, never throwing.
 */
export async function loadAdherenceLedger(supabase, { nowMs, windowDays = 14 } = {}) {
  if (!supabase || !Number.isFinite(nowMs)) return [];
  try {
    const windowStartIso = new Date(nowMs - Math.max(2, windowDays) * DAY_MS).toISOString();
    return await fetchAllPaginated(() => supabase
      .from('adam_adherence_ledger')
      .select('created_at, verdict')
      .gte('created_at', windowStartIso)
      .eq('verdict', 'fail')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })); // unique tiebreaker for stable paging (FR-6)
  } catch {
    return [];
  }
}
