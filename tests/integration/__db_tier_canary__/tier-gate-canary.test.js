/**
 * TS-1 canary — SD-LEO-INFRA-VITEST-TIER-REAL-001 AC-1.
 *
 * This file DELIBERATELY imports nothing from tests/helpers/db-available.js: it stands in for
 * the ~127 db-tier suites that never import the guard and therefore can only be covered by the
 * TIER-level gate in tests/setup.db.js. It is a real DB_INCLUDE member (tests/integration/**)
 * on purpose — that membership IS the thing under test.
 *
 * Undesignated run: every test here reports SKIPPED (the setup gate's ctx.skip()), exit 0.
 * Designated run: they execute (and pass without touching the DB — the canary proves gating,
 * not connectivity). The spawn harness in tests/unit/testing/db-tier-gate.spawn.test.js runs
 * this file both ways and asserts the outcomes.
 */
import { describe, it, expect } from 'vitest';

describe('db-tier canary (no guard import)', () => {
  it('runs only under a designated target — an undesignated run reports this as skipped', () => {
    expect(1 + 1).toBe(2);
  });

  it('second test, same contract — skip coverage is per-test, not per-suite', () => {
    expect(true).toBe(true);
  });
});
