/**
 * SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 (FR-2, TR-6, TS-4).
 *
 * FR-2 requires the charter's STANDARD_LOOPS governance representation to be DRIFT-CHECKED
 * against the live array, never "generated from" it -- TESTING sub-agent (PLAN row a287419c)
 * proved "generated from" makes a desync-detection test vacuously green (a fixture flip
 * regenerates the table too, so the assertion can never fail). This test compares the live
 * STANDARD_LOOPS array against the checked-in snapshot (scripts/coordinator-loop-governance-snapshot.json)
 * that the coordinator_role_contract DB row's loop-governance prose is required to match.
 *
 * MUST be .test.js, not .test.mjs (TR-7) -- the prior STANDARD_LOOPS pin test
 * (tests/unit/coordinator-startup-check.test.mjs:43) is a node:test .test.mjs file outside
 * vitest's include globs and is DEAD (silently asserting a stale count against a live array).
 */
import { describe, it, expect } from 'vitest';
import { STANDARD_LOOPS } from '../../../scripts/coordinator-startup-check.mjs';
import snapshot from '../../../scripts/coordinator-loop-governance-snapshot.json' assert { type: 'json' };

describe('STANDARD_LOOPS governance snapshot stays in sync with the live registry (FR-2/TR-6)', () => {
  it('total loop count matches the snapshot', () => {
    expect(STANDARD_LOOPS.length).toBe(snapshot.total_loops);
  });

  it('the session_arm:false (GHA-only) key set matches the snapshot exactly', () => {
    const live = STANDARD_LOOPS.filter((l) => l.session_arm === false).map((l) => l.key).sort();
    expect(live).toEqual([...snapshot.session_arm_false_keys].sort());
  });

  it('gha_backed count matches the snapshot', () => {
    const live = STANDARD_LOOPS.filter((l) => l.gha_backed === true).length;
    expect(live).toBe(snapshot.gha_backed_count);
  });

  it('the carve-out keys remain gha_backed but NOT session_arm:false', () => {
    for (const key of snapshot.gha_only_carve_out_keys) {
      const loop = STANDARD_LOOPS.find((l) => l.key === key);
      expect(loop, `expected a STANDARD_LOOPS entry for carve-out key "${key}"`).toBeTruthy();
      expect(loop.gha_backed).toBe(true);
      expect(loop.session_arm).not.toBe(false);
    }
  });

  it('DISCRIMINATES: a deliberately-desynced fixture fails (proves this is not vacuously green)', () => {
    // TR-6's whole point: unlike "generated from", drift-checking must be able to fail.
    const desyncedFixture = STANDARD_LOOPS.map((l) => ({ ...l }));
    desyncedFixture[0].session_arm = desyncedFixture[0].session_arm === false ? true : false;
    const live = desyncedFixture.filter((l) => l.session_arm === false).map((l) => l.key).sort();
    const expected = [...snapshot.session_arm_false_keys].sort();
    expect(live).not.toEqual(expected);
  });
});
