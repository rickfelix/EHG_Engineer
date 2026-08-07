/**
 * QF-20260807-190 — the reaper's predicate is the whole safety argument, so it is pinned here.
 *
 * This reaper deletes rows from a PRODUCTION table. The only thing standing between "removes 53
 * abandoned test fixtures" and "blinds the fleet's liveness watchers" is which keys `isReapable`
 * returns true for. A bare `__` prefix — the obvious shorthand, and the one a hurried reader would
 * write — destroys `__watcher_self__` and `__eva_scheduler_watcher_self`, each of which is a
 * watcher's own liveness marker. That is not a near-miss; it is deleting the instrument the reaper
 * exists to unblind.
 *
 * The second of those two rows was NOT in the original report. It surfaced only by enumerating
 * every `__`-leading prefix from the live data instead of from the single example that had been
 * noticed. So this suite asserts the real rows by name rather than asserting a regex shape: a
 * shape-only test would have passed against the predicate that kills them.
 */
import { describe, it, expect } from 'vitest';
import { isReapable, E2E_FIXTURE_PREFIX } from '../../../scripts/reap-e2e-liveness-fixtures.mjs';

// Measured live 2026-08-07T16:51Z, then RE-READ IN FULL from the reaper's own dry run. These are
// REAL rows and deleting either is the worst outcome this QF could produce, so they are named
// explicitly rather than described.
//
// The second key was briefly wrong here: my prefix survey printed keys sliced to 28 characters for
// display, and I copied `__eva_scheduler_watcher_self` — the TRUNCATED form — into this constant as
// though it were the key. Both forms happen to return false, so every assertion still passed; the
// test was green and the datum was fiction. An identifier shortened for display and then re-consumed
// as input is its own defect class, and a constant that documents a production row must be the
// whole row.
const REAL_WATCHER_ROWS = ['__watcher_self__', '__eva_scheduler_watcher_self__'];

// Also live, also real: keys that merely SOUND test-shaped. A name is a claim, not evidence.
const REAL_BUT_TEST_SOUNDING = [
  'gha_cron:venture-fixture-sweep.yml',
  'standard_loop:account-usage-sample',
  'cron_script:account-usage-sample.mjs',
];

// Real fixture keys observed in the leak, one per test in creation order.
const ACTUAL_LEAKED_FIXTURES = [
  '__e2e_periodic_liveness_silenced_1752349227697__',
  '__e2e_periodic_liveness_recovers_then_relapses_1752349227697__',
  '__e2e_periodic_liveness_healthy_1752349227697__',
  '__e2e_periodic_liveness_stood_down_1752349227697__',
  '__e2e_periodic_liveness_owner_first_1752349227697__',
  '__e2e_periodic_liveness_ladder_pre_migration_1752349227697__',
];

describe('QF-20260807-190 — reaper predicate', () => {
  it('reaps every shape of fixture residue actually observed in the leak', () => {
    for (const key of ACTUAL_LEAKED_FIXTURES) {
      expect(isReapable(key), `${key} is fixture residue and must be reapable`).toBe(true);
    }
    // The unregistered-stamp fixture from the same suite uses a different infix.
    expect(isReapable('__e2e_unregistered_1752349227697__')).toBe(true);
  });

  it('NEVER reaps the watcher self-markers — the load-bearing control', () => {
    for (const key of REAL_WATCHER_ROWS) {
      expect(isReapable(key), `${key} is a REAL watcher marker and must survive`).toBe(false);
    }
  });

  it('a bare __ prefix would kill them, which is why the predicate is __e2e_', () => {
    // The counter-test, stated as a live comparison rather than as prose. If someone later
    // "simplifies" the predicate to /^__/, this is the assertion that explains what breaks.
    const naive = (k) => typeof k === 'string' && k.startsWith('__');
    for (const key of REAL_WATCHER_ROWS) {
      expect(naive(key)).toBe(true);        // the naive predicate DOES match them
      expect(isReapable(key)).toBe(false);  // ours does not
    }
    expect(E2E_FIXTURE_PREFIX).toBe('__e2e_');
  });

  it('NEVER reaps real processes whose names merely sound test-shaped', () => {
    for (const key of REAL_BUT_TEST_SOUNDING) {
      expect(isReapable(key), `${key} reads test-ish but is real`).toBe(false);
    }
  });

  it('reaps on PROVENANCE only — a fixture-looking key elsewhere in the name is not enough', () => {
    // The prefix must LEAD. A real key that merely contains the marker later is not residue.
    expect(isReapable('gha_cron:not__e2e_periodic_liveness_thing.yml')).toBe(false);
    expect(isReapable('standard_loop:__e2e_lookalike')).toBe(false);
  });

  it('is total on junk input rather than throwing into a delete path', () => {
    for (const bad of [null, undefined, 42, {}, [], '']) {
      expect(isReapable(bad)).toBe(false);
    }
  });
});
