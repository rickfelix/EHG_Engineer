/**
 * QF-20260726-459 — ACCEPTANCE: the guard must refuse THE REAL ENVIRONMENT.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE UNIT TESTS. The unit-project tests for this guard prove the
 * predicate's logic, but they run under tests/setup.js, which injects the synthetic sentinel — so they
 * can only ever demonstrate refusal of a FAKE target. That is precisely the environment in which the
 * OLD guard also looked correct. The defect only appears when REAL credentials are present.
 *
 * This file is named *.db.test.js so it is collected by the **db project**, whose setupFiles
 * (tests/setup.db.js) load the REAL .env — the exact configuration under which HAS_REAL_DB evaluated
 * TRUE against production project ref dedlbzhpgkmetvhbkyzq, the database holding 148 ventures.
 *
 * A GUARD THAT CANNOT BE SHOWN TO DISCRIMINATE IS NOT A GUARD. Demonstrated both directions against
 * this file:
 *   BEFORE the fix (old sentinel predicate restored): FAILS — HAS_REAL_DB is true with the real .env.
 *   AFTER  the fix:                                   PASSES — refused, reason no_designated_target.
 *
 * SAFETY: this test is PURE. It reads the predicate and env only; it opens no socket and issues no
 * query, so collecting it in the db project cannot itself reach the database.
 */
import { describe, it, expect } from 'vitest';
import { HAS_REAL_DB, DB_TARGET, DB_IS_REACHABLE, assessDbTarget } from './db-available.js';

describe('QF-459 ACCEPTANCE: real .env present, guard must still refuse', () => {
  it('HAS_REAL_DB is FALSE even though real credentials are loaded', () => {
    // THE REGRESSION THIS PINS. With the real .env, the old predicate returned true and the db project
    // targeted production. If this ever reads true again without an explicit designated target, the
    // fleet is back to running destructive suites against live data.
    expect(HAS_REAL_DB).toBe(false);
  });

  it('refuses for a NAMED reason, not by accident', () => {
    // Distinguishes "correctly refused" from "something else broke and everything skips". An
    // always-skip guard silently deletes all DB coverage while passing any test asserting only false.
    expect(DB_TARGET.allowed).toBe(false);
    expect(['no_designated_target', 'opt_in_ref_mismatch', 'unrecognised_target'])
      .toContain(DB_TARGET.reason);
  });

  it('and it refuses DESPITE the database being genuinely reachable — the whole point', () => {
    // The two questions the old guard conflated, now visibly separated in one assertion:
    // reachability is true, safety is false. That gap IS the defect, and it is now representable.
    if (DB_IS_REACHABLE) {
      expect(DB_TARGET.ref).toBeTruthy();      // we identified a real project…
      expect(HAS_REAL_DB).toBe(false);          // …and still refused it
    }
  });

  it('would ALLOW if this exact target were explicitly designated (proves it is not an always-skip)', () => {
    // The control. Same real env, plus an opt-in naming the ref it actually points at → allowed.
    // Without this, "HAS_REAL_DB is false" is satisfied equally by a guard that can never say yes.
    const ref = DB_TARGET.ref;
    if (!ref) return; // no real target configured in this environment; nothing to control against
    const allowed = assessDbTarget({ ...process.env, VITEST_DB_ALLOW_REF: ref });
    expect(allowed.allowed).toBe(true);
    expect(allowed.reason).toBe('explicit_opt_in_matches_target');
  });
});
