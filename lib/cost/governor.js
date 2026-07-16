/**
 * Cost/token GOVERNOR — pure decision core (NO I/O).
 * SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001 (FR-1)
 *
 * Turns the report-only cost instruments (scripts/cost-waste-ledger.mjs,
 * scripts/llm-cost-report.mjs) into an ENFORCING self-improving governor. This
 * module holds ONLY pure decision functions — no supabase/fs/fetch imports — so
 * every branch (including the fail-open ones) is unit-testable and the CLI, cron,
 * and tests share one implementation. All I/O lives in scripts/cost-governor.mjs
 * and lib/cost/governor-log.js.
 *
 * Design constraints (validation-agent GO-WITH-NOTES, conf 88):
 *  - decideTier consumes the eval decision rule (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001,
 *    still in_progress) via a STABLE SEAM and fails OPEN (no down-tier) when the rule
 *    is unavailable — this SD must not block on that dependency.
 *  - Enforcement blast-radius is AVAILABILITY (a mis-firing throttle could stall the
 *    fleet); the core only DECIDES — the CLI's observe-only default + fail-open wiring
 *    is what protects the fleet. Every decision carries a MEASURED reason.
 *
 * @module lib/cost/governor
 */

/** Default governor thresholds. Start values; tuneThresholds() adjusts them from outcomes. */
export const DEFAULT_THRESHOLDS = Object.freeze({
  // Regen-storm: more than maxPerWindow regens on one target inside windowMs = a storm.
  regen: Object.freeze({ windowMs: 3_600_000, maxPerWindow: 10 }),
  // Anomaly: mirrors the llm-cost-report --check thresholds (single implementation).
  anomaly: Object.freeze({ maxDailyUsd: 12, maxDailyCalls: 3000, spike: 2.0 }),
  // Self-tuning bounds/factors for tuneThresholds().
  tune: Object.freeze({ tightenFactor: 0.8, loosenFactor: 1.15, minPerWindow: 3, maxPerWindow: 50 }),
});

/**
 * Down-tier ladder: each model maps to the next-cheaper model in its family
 * (cost-descending). Used only when the eval rule confirms the cheaper tier clears
 * the bar — the ladder never down-tiers on its own.
 */
export const TIER_LADDER = Object.freeze({
  'claude-opus': 'claude-sonnet',
  'claude-sonnet': 'claude-haiku',
  'gemini-2.5-pro': 'gemini-2.5-flash',
  'gemini-2.5-flash': 'gemini-2.5-flash-lite',
  'gpt-5.5': 'gpt-5.4',
  'gpt-5.4': 'gpt-5.4-mini',
  'gpt-5.4-mini': 'gpt-5.4-nano',
});

/** Coerce a regen event (object with {at}/{captured_at}/{timestamp} or a raw ms/ISO) to epoch ms. */
function eventTimeMs(e) {
  if (e == null) return NaN;
  if (typeof e === 'number') return e;
  if (typeof e === 'string') { const t = Date.parse(e); return Number.isNaN(t) ? NaN : t; }
  const raw = e.at ?? e.captured_at ?? e.timestamp ?? e.created_at;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') { const t = Date.parse(raw); return Number.isNaN(t) ? NaN : t; }
  return NaN;
}

/**
 * FR-1a — Regen-storm detector/throttle. PURE: the window is anchored to the newest
 * event (or an explicit `now`), so no wall-clock is read. Counts events for this target
 * inside windowMs; THROTTLE when the count meets/exceeds the threshold, else ALLOW.
 *
 * @param {string} targetKey       the regeneration target fingerprint
 * @param {Array}  events          recent regen events (objects with a timestamp, or raw ts)
 * @param {object} [cfg]           { windowMs, maxPerWindow }
 * @param {number} [now]           optional window anchor (epoch ms); defaults to newest event
 * @returns {{action:'throttle'|'allow', measured:object, reason:string}}
 */
export function evaluateRegen(targetKey, events = [], cfg = DEFAULT_THRESHOLDS.regen, now = null) {
  const windowMs = cfg?.windowMs ?? DEFAULT_THRESHOLDS.regen.windowMs;
  const threshold = cfg?.maxPerWindow ?? DEFAULT_THRESHOLDS.regen.maxPerWindow;
  const times = (Array.isArray(events) ? events : [])
    .map(eventTimeMs)
    .filter((t) => !Number.isNaN(t));
  const anchor = typeof now === 'number' ? now : (times.length ? Math.max(...times) : 0);
  const count = times.filter((t) => t <= anchor && t > anchor - windowMs).length;
  const measured = { targetKey, count, windowMs, threshold, anchor };
  if (count >= threshold) {
    return {
      action: 'throttle',
      measured,
      reason: `regen-storm: ${count} regenerations of "${targetKey}" within ${Math.round(windowMs / 60000)}m ≥ threshold ${threshold} — throttling further regens`,
    };
  }
  return {
    action: 'allow',
    measured,
    reason: `regen ok: ${count}/${threshold} on "${targetKey}" within ${Math.round(windowMs / 60000)}m`,
  };
}

/**
 * FR-1b — Down-tier router. STABLE SEAM + FAIL-OPEN: when evalRule is null/undefined
 * or lacks a clears() function (the eval-rule dependency is not live yet), returns the
 * current tier with downTiered=false — it NEVER guesses a cheaper tier. When a rule is
 * present, it down-tiers only if evalRule.clears(cheaperTier, usageStats) is true.
 *
 * @param {string}  currentModel  the model currently in use (a TIER_LADDER key)
 * @param {object}  usageStats    observed usage/quality signal passed to the eval rule
 * @param {object|null} evalRule  { clears(cheaperTier, usageStats): boolean } or null
 * @returns {{tier:string, downTiered:boolean, reason:string}}
 */
export function decideTier(currentModel, usageStats = {}, evalRule = null) {
  if (!evalRule || typeof evalRule.clears !== 'function') {
    return { tier: currentModel, downTiered: false, reason: 'no down-tier (fail-open: eval decision rule unavailable)' };
  }
  const cheaper = TIER_LADDER[currentModel];
  if (!cheaper) {
    return { tier: currentModel, downTiered: false, reason: `no cheaper tier below ${currentModel} in the ladder` };
  }
  let clears = false;
  try { clears = evalRule.clears(cheaper, usageStats) === true; }
  catch { return { tier: currentModel, downTiered: false, reason: `no down-tier (fail-open: eval rule threw evaluating ${cheaper})` }; }
  if (clears) {
    return { tier: cheaper, downTiered: true, reason: `${cheaper} clears the eval bar for observed usage — down-tiering from ${currentModel}` };
  }
  return { tier: currentModel, downTiered: false, reason: `${cheaper} does not clear the eval bar — holding ${currentModel}` };
}

/**
 * FR-1c — Anomaly classifier (fail-LOUD). Evaluates the most-recent COMPLETE day in
 * the series against absolute thresholds and a spike× multiple of the trailing average.
 * Mirrors the llm-cost-report.mjs --check logic so alert and enforce share one rule.
 *
 * @param {Array} daySeries  [{ day, usd, calls }, ...] ascending by day; last = newest
 * @param {object} [cfg]     { maxDailyUsd, maxDailyCalls, spike }
 * @returns {{anomaly:boolean, severity:'none'|'warn'|'critical', breaches:string[], day:string|null}}
 */
export function classifyAnomaly(daySeries = [], cfg = DEFAULT_THRESHOLDS.anomaly) {
  const maxUsd = cfg?.maxDailyUsd ?? DEFAULT_THRESHOLDS.anomaly.maxDailyUsd;
  const maxCalls = cfg?.maxDailyCalls ?? DEFAULT_THRESHOLDS.anomaly.maxDailyCalls;
  const spike = cfg?.spike ?? DEFAULT_THRESHOLDS.anomaly.spike;
  const series = (Array.isArray(daySeries) ? daySeries : []).filter((d) => d && d.day);
  if (!series.length) return { anomaly: false, severity: 'none', breaches: [], day: null };
  const last = series[series.length - 1];
  const trailing = series.slice(-8, -1); // up to 7 days before `last`
  const avgUsd = trailing.length ? trailing.reduce((a, d) => a + (d.usd || 0), 0) / trailing.length : 0;
  const breaches = [];
  if ((last.usd || 0) > maxUsd) breaches.push(`spend $${(last.usd || 0).toFixed(2)} > $${maxUsd.toFixed(2)}`);
  if ((last.calls || 0) > maxCalls) breaches.push(`calls ${last.calls || 0} > ${maxCalls}`);
  if (avgUsd > 0 && (last.usd || 0) > avgUsd * spike) breaches.push(`spend $${(last.usd || 0).toFixed(2)} > ${spike}× trailing avg $${avgUsd.toFixed(2)}`);
  const anomaly = breaches.length > 0;
  const severity = !anomaly ? 'none' : (breaches.length >= 2 ? 'critical' : 'warn');
  return { anomaly, severity, breaches, day: last.day };
}

/**
 * FR-1d — Self-improving threshold tuner. DETERMINISTIC + IDEMPOTENT for identical
 * inputs. Tightens the regen budget when outcomes show the storm was NOT reduced or the
 * gate rate dropped; holds/loosens (bounded) when outcomes are healthy.
 *
 * @param {object} current  a thresholds object (shape of DEFAULT_THRESHOLDS)
 * @param {object} outcomes { regenReduced:boolean, gateRateHeld:boolean }
 * @returns {object} next thresholds (new object; input not mutated)
 */
export function tuneThresholds(current = DEFAULT_THRESHOLDS, outcomes = {}) {
  const base = current && current.regen ? current : DEFAULT_THRESHOLDS;
  const tune = base.tune || DEFAULT_THRESHOLDS.tune;
  const curMax = base.regen.maxPerWindow;
  const healthy = outcomes.regenReduced === true && outcomes.gateRateHeld === true;
  const regressed = outcomes.regenReduced === false || outcomes.gateRateHeld === false;
  let nextMax = curMax;
  let note = 'held (no outcome signal)';
  if (regressed) {
    nextMax = Math.max(tune.minPerWindow, Math.round(curMax * tune.tightenFactor));
    note = `tightened ${curMax}→${nextMax} (regen not reduced or gate rate dropped)`;
  } else if (healthy) {
    nextMax = Math.min(tune.maxPerWindow, Math.round(curMax * tune.loosenFactor));
    note = `loosened ${curMax}→${nextMax} (healthy: regen reduced + gate rate held)`;
  }
  return {
    regen: { ...base.regen, maxPerWindow: nextMax },
    anomaly: { ...base.anomaly },
    tune: { ...tune },
    _tune_note: note,
  };
}

export default { DEFAULT_THRESHOLDS, TIER_LADDER, evaluateRegen, decideTier, classifyAnomaly, tuneThresholds };
