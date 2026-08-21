/**
 * SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-3) — recurrence trip-wire for
 * feedback.category='wind_down_survey' inflow.
 *
 * PURE MODULE — no DB access. scripts/gauges/wind-down-recurrence-check.mjs is the executor.
 *
 * WHY BASELINE-VS-TREND, NOT A FIXED ABSOLUTE THRESHOLD (TESTING evidence 143b8c17-d017-4982-b0ab-02532ec87daa):
 * up to 22 concurrent worktrees may run a stale copy of scripts/hooks/stop-loop-wakeup-reminder.cjs
 * for as long as each independently takes to refresh from main (measured: 12 of 22 stale at TESTING
 * time). A fixed small absolute threshold (e.g. ">5 rows/24h") would false-trip continuously
 * throughout that EXPECTED, multi-day rollout tail. Comparing the trailing count against a
 * ship-time BASELINE and requiring a DECLINING trend (not an absolute zero) distinguishes "still
 * converging as designed" from "the old code path was actually reintroduced" (a genuine
 * regression, where the trailing count would be flat or rising, never below baseline).
 */

/**
 * @param {Object} input
 * @param {number} input.baselineCount - feedback.category='wind_down_survey' count over the 24h
 *   window immediately preceding FR-1's ship (the pre-fix steady state).
 * @param {number} input.trailingCount - the SAME 24h-window count, measured now.
 * @param {number} [input.fallbackFloor=5] - used only when baselineCount is 0/unset (no recorded
 *   baseline) — a trailingCount above this floor is treated as new, unexplained activity.
 * @returns {{alarmed: boolean, reason: string}}
 */
export function evaluateWindDownRecurrence({ baselineCount, trailingCount, fallbackFloor = 5 } = {}) {
  if (!Number.isFinite(trailingCount) || trailingCount < 0) {
    return { alarmed: false, reason: 'insufficient data: trailingCount is not a valid count' };
  }
  if (!Number.isFinite(baselineCount) || baselineCount <= 0) {
    const alarmed = trailingCount > fallbackFloor;
    return {
      alarmed,
      reason: alarmed
        ? `no recorded baseline; trailing count ${trailingCount} exceeds the fallback floor ${fallbackFloor}`
        : `no recorded baseline; trailing count ${trailingCount} is within the fallback floor ${fallbackFloor}`,
    };
  }
  const declining = trailingCount < baselineCount;
  return {
    alarmed: !declining,
    reason: declining
      ? `trailing count ${trailingCount} is below baseline ${baselineCount} — converging as expected`
      : `trailing count ${trailingCount} is NOT below baseline ${baselineCount} — recurrence suspected (the old code path may have been reintroduced, or rollout has stalled)`,
  };
}

/**
 * The ship-time baseline, measured live immediately before FR-1's code shipped (2026-08-21):
 * feedback.category='wind_down_survey' inflow over the preceding 24h window was 206 rows (of
 * 301 total feedback rows, 68.4% share). Recorded here as a plain constant — matching this
 * repo's established convention of hardcoding a measured-at-authoring-time figure directly in
 * the artifact it bounds (e.g. purge-migration plausibility ceilings) rather than inventing a
 * new persisted-baseline mechanism for a single-use figure.
 *
 * ACCEPTED LIMITATION (TESTING evidence c6902d6e): this constant never decays. Once the trailing
 * count first drops below 206, it stays the ceiling forever — a slow, partial reintroduction of
 * the old feedback-table write path (e.g. 150/24h, steady) would sit permanently below baseline
 * and never trip this guard, even though it is a genuine regression. A fully dynamic
 * self-updating baseline (e.g. a rolling minimum-since-ship) was judged disproportionate effort
 * for a single write-only telemetry lane; the pragmatic mitigation is that expected steady state
 * is ~0/24h (the table this replaces has zero remaining writers other than the one
 * already-fixed hook), so any sustained non-zero trailing count is itself worth a manual look
 * even while this gauge stays green.
 */
export const SHIP_TIME_BASELINE_COUNT_24H = 206;
