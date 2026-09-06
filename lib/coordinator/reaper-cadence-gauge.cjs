/**
 * Reaper cadence gauge (SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001, FR-2).
 *
 * Ground truth for "is the reaper tick actually firing" is worktree-reaper-tick.cjs's OWN
 * persisted state file (last_spawn_at) — NEVER "Task Scheduler reports the task healthy".
 * The sweep task's settings are MultipleInstancesPolicy=IgnoreNew + ExecutionTimeLimit=PT72H,
 * so a single hung sweep instance can swallow every 5-min trigger for up to 72 hours while
 * Task Scheduler's own NumberOfMissedRuns counter stays at 0 — a healthy-looking OS task
 * definition proves nothing about whether the tick is actually spawning the reaper.
 */
'use strict';

const path = require('path');
const { readState, DEFAULT_CADENCE, STATE_RELATIVE } = require('../../scripts/fleet/worktree-reaper-tick.cjs');

// Matches the "EHG LEO Stale-Session Sweep" task's registered cadence (scripts/cron/
// stale-session-sweep-task.cmd via setup-liveness-watcher-task.mjs SWEEP_INTERVAL_MINUTES).
// Not imported from there to avoid a lib -> scripts -> a Windows-schtasks-heavy module chain
// for a single constant; documented here so a change to that value is visible on both sides.
const DEFAULT_SWEEP_INTERVAL_MINUTES = 5;

/**
 * PRD's own stated alert threshold: "if last_spawn_at has not advanced within 2x the expected
 * sweep-piggyback interval". Expressed as a multiplier so a caller can override the base
 * cadence/interval without also having to recompute the multiplier.
 */
const DEFAULT_STALE_MULTIPLIER = 2;

/**
 * Pure: is a given last_spawn_at (or its absence) healthy, given the expected cadence?
 * @param {{lastSpawnAt: string|null, nowMs?: number, cadence?: number, sweepIntervalMinutes?: number, staleMultiplier?: number}} input
 * @returns {{healthy: boolean, reason: string, expectedIntervalMinutes: number, ageMinutes: number|null}}
 */
function evaluateCadenceHealth({
  lastSpawnAt, nowMs = Date.now(), cadence = DEFAULT_CADENCE,
  sweepIntervalMinutes = DEFAULT_SWEEP_INTERVAL_MINUTES, staleMultiplier = DEFAULT_STALE_MULTIPLIER,
} = {}) {
  const expectedIntervalMinutes = cadence * sweepIntervalMinutes;
  const staleThresholdMinutes = expectedIntervalMinutes * staleMultiplier;

  if (!lastSpawnAt) {
    return { healthy: false, reason: 'never_spawned', expectedIntervalMinutes, ageMinutes: null };
  }
  const spawnMs = Date.parse(lastSpawnAt);
  if (!Number.isFinite(spawnMs)) {
    return { healthy: false, reason: 'unparseable_last_spawn_at', expectedIntervalMinutes, ageMinutes: null };
  }
  const ageMinutes = (nowMs - spawnMs) / 60000;
  if (ageMinutes < 0) {
    // A future timestamp is not evidence of health either way — report it rather than silently
    // clamping, since it points at a clock problem worth surfacing on its own.
    return { healthy: false, reason: 'last_spawn_at_in_future', expectedIntervalMinutes, ageMinutes };
  }
  if (ageMinutes > staleThresholdMinutes) {
    return { healthy: false, reason: 'stale', expectedIntervalMinutes, ageMinutes };
  }
  return { healthy: true, reason: 'within_expected_cadence', expectedIntervalMinutes, ageMinutes };
}

/**
 * Reads the reaper tick's persisted state file and evaluates cadence health from it.
 * Best-effort: a read failure reports unhealthy (never_spawned-shaped) rather than throwing —
 * a gauge that can crash its caller is worse than one that reports "unknown, treat as stale".
 * @param {{repoRoot: string, nowMs?: number, cadence?: number, sweepIntervalMinutes?: number, staleMultiplier?: number}} opts
 */
function readCadenceHealth({ repoRoot, ...rest } = {}) {
  if (!repoRoot) throw new Error('readCadenceHealth: repoRoot required');
  const statePath = path.join(repoRoot, STATE_RELATIVE);
  const state = readState(statePath); // never throws — readState itself defaults on any error
  return { ...evaluateCadenceHealth({ lastSpawnAt: state.last_spawn_at, ...rest }), state_path: statePath };
}

module.exports = {
  DEFAULT_SWEEP_INTERVAL_MINUTES,
  DEFAULT_STALE_MULTIPLIER,
  evaluateCadenceHealth,
  readCadenceHealth,
};
