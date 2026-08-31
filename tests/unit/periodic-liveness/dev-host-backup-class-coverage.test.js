/**
 * QF-20260831-881 — the dev-host STANDARD_LOOPS 'liveness-watcher' entry gained a backup lane
 * for self_stamped/eva_scheduler_heartbeat rows: the GHA cron (periodic-liveness-watcher-cron.yml)
 * is their declared owner, but its real schedule delivery drifts up to hours against the declared
 * 15-minute cadence, leaving those rows with no evaluator for hours at a time (measured specimen:
 * g3-armed-sd-leo-infra-adam-decision-scheduler-001, self_stamped, frozen last_state=OK for 4h+).
 *
 * [SPECIMEN] the dev-host loop now also evaluates self_stamped/eva_scheduler_heartbeat.
 * [TWO-SIDED] github_actions_api stays GHA-exclusive — the dev host has no Actions API token.
 */
import { describe, it, expect } from 'vitest';
import { STANDARD_LOOPS } from '../../../scripts/coordinator-startup-check.mjs';

describe("STANDARD_LOOPS 'liveness-watcher' backup class coverage", () => {
  const loop = STANDARD_LOOPS.find((l) => l.key === 'liveness-watcher');

  it('[SPECIMEN] carries the PID-anchored class plus the two timestamp-source classes', () => {
    expect(loop.prompt).toMatch(/LIVENESS_CLASSES=claude_sessions_heartbeat,self_stamped,eva_scheduler_heartbeat/);
  });

  it('[TWO-SIDED] never carries github_actions_api — that class needs the GHA-exclusive Actions API token', () => {
    expect(loop.prompt).not.toMatch(/github_actions_api/);
  });
});
