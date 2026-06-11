// SD-MAN-INFRA-RETENTION-OPS-FINISHER-001: creation-teardown parity for the weekly
// retention-enforce loop (the chairman-GO'd archive-not-delete machinery from
// SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001, finally armed). Convention mirrors
// the row-growth / review-rotation / scripts-reachability parity pins: the loop must
// exist in STANDARD_LOOPS (creation), COORDINATOR_CRONS (teardown inventory), and
// COORD_SCRIPT_MARKERS (CronList matcher) — a miss at any site = orphan-cron risk.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { STANDARD_LOOPS } from '../../scripts/coordinator-startup-check.mjs';

const require = createRequire(import.meta.url);
const { COORDINATOR_CRONS, COORD_SCRIPT_MARKERS, selectCoordinatorCronJobs } =
  require('../../lib/coordinator/teardown-coordinator.cjs');

describe('retention loop — creation site (STANDARD_LOOPS)', () => {
  const loop = STANDARD_LOOPS.find((l) => l.key === 'retention');

  it('exists with the weekly Sunday 03:00 cadence', () => {
    expect(loop).toBeTruthy();
    expect(loop.cron).toBe('0 3 * * 0');
    expect(loop.script).toBe('retention-enforce.js');
  });

  it('prompt mirrors the emitted arming spec (apply + report + STALE surfacing)', () => {
    expect(loop.prompt).toMatch(/retention:apply/);
    expect(loop.prompt).toMatch(/per-table archived\/deleted counts/);
    expect(loop.prompt).toMatch(/STALE/);
    expect(loop.prompt).toMatch(/coordinator/);
  });
});

describe('retention loop — teardown parity', () => {
  it('COORDINATOR_CRONS carries the matching entry (same cadence, non-pointer-asserting)', () => {
    const cron = COORDINATOR_CRONS.find((c) => c.key === 'retention');
    expect(cron).toBeTruthy();
    expect(cron.cadence).toBe('0 3 * * 0');
    expect(cron.re_asserts_pointer).toBe(false);
  });

  it('COORD_SCRIPT_MARKERS matches BOTH the script basename and the npm alias', () => {
    expect(COORD_SCRIPT_MARKERS).toContain('retention-enforce.js');
    expect(COORD_SCRIPT_MARKERS).toContain('retention:apply');
  });

  it('selectCoordinatorCronJobs recognises a CronList row created from the arming-spec prompt', () => {
    const picked = selectCoordinatorCronJobs([
      { id: 'x1', prompt: 'Run `npm run retention:apply` in EHG_Engineer and report the per-table archived/deleted counts' },
      { id: 'x2', prompt: 'something unrelated' },
    ]);
    expect(picked.map((j) => j.id)).toEqual(['x1']);
  });
});

describe('drive-by: scripts-reachability marker parity (pre-existing gap closed)', () => {
  it('scripts-reachability-gauge.mjs is now in COORD_SCRIPT_MARKERS', () => {
    expect(COORD_SCRIPT_MARKERS).toContain('scripts-reachability-gauge.mjs');
  });

  it('every COORDINATOR_CRONS entry is matchable by at least one marker (full-inventory parity)', () => {
    for (const c of COORDINATOR_CRONS) {
      const matched = COORD_SCRIPT_MARKERS.some((m) => String(c.command).includes(m));
      expect(matched, `${c.key} (${c.command}) has no matching marker`).toBe(true);
    }
  });
});
