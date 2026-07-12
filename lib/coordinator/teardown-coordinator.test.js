// SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001 — unit tests for the coordinator cron
// inventory + matcher. NFR-1: no live pointer/cron/DB is touched.
// QF-20260712-716: the clearCoordinatorPointer() tests were removed along with the
// function itself — COORD_TEARDOWN_SAFETY_V2 was a disabled-aging flag never turned on
// in practice, so the flag-off no-op path was the only live behavior.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  listCoordinatorCrons,
  selectCoordinatorCronJobs
} = require('./teardown-coordinator.cjs');

describe('teardown-coordinator: inventory + matcher', () => {
  // QF-20260611-101: the cron inventory grows ~weekly and the magic-number pin
  // broke main twice in one day (7->8 #4626, 8->9 #4645). The key LIST is the
  // single pin now; the count derives from it. Adding a cron = add ONE key here.
  // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: 'quiet-tick' joined the inventory (the consolidation
  // cron the cutover arms — teardown must remove it like any other coordinator loop).
  const EXPECTED_CRON_KEYS = ['sweep', 'quiet-tick', 'dashboard', 'identity', 'inbox', 'email', 'row-growth', 'review-rotation', 'scripts-reachability', 'retention'];

  it('listCoordinatorCrons enumerates exactly the expected coordinator crons incl the pointer-re-asserting inbox loop', () => {
    const crons = listCoordinatorCrons();
    expect(crons.map((c) => c.key)).toEqual(EXPECTED_CRON_KEYS);
    const inbox = crons.find((c) => c.key === 'inbox');
    expect(inbox).toBeTruthy();
    expect(inbox.re_asserts_pointer).toBe(true); // the crux: missing this cron self-reverses teardown
  });

  it('TS-6: selectCoordinatorCronJobs matches coordinator crons (incl inbox via fleet-dashboard.cjs marker) and excludes non-coordinator jobs', () => {
    const jobs = [
      { id: 'a', prompt: 'node scripts/stale-session-sweep.cjs' },
      { id: 'b', prompt: 'node scripts/fleet-dashboard.cjs all' },
      { id: 'c', prompt: 'node scripts/fleet-dashboard.cjs inbox' }, // critical: same basename as dashboard
      { id: 'd', prompt: 'node scripts/assign-fleet-identities.cjs' },
      { id: 'f', prompt: 'COORD_EMAIL_TICK=27801 node scripts/coordinator-email-summary.mjs' }, // email loop (coordinator-confirmed)
      { id: 'e', prompt: 'node scripts/some-worker-loop.cjs' } // NOT a coordinator cron
    ];
    const matched = selectCoordinatorCronJobs(jobs);
    expect(matched.map((j) => j.id).sort()).toEqual(['a', 'b', 'c', 'd', 'f']);
    expect(matched.find((j) => j.prompt.includes('inbox'))).toBeTruthy();
    expect(matched.find((j) => j.prompt.includes('coordinator-email-summary'))).toBeTruthy();
    expect(selectCoordinatorCronJobs(null)).toEqual([]);
  });
});
