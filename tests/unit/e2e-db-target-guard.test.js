/**
 * Hermetic unit tests for tests/helpers/e2e-db-target-guard.js — SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001.
 *
 * All cases here pass an EXPLICIT env bag to assertPlaywrightTargetSafe(), never process.env —
 * this both keeps the tests hermetic (no dependency on the real .env file / real dotenv load)
 * and exercises the pure decision logic directly, matching TS-2's corrected design (GAP-7):
 * a spawned playwright.config.js process would reload the real on-disk .env via its own
 * dotenv.config() call, defeating any attempt to unset SUPABASE_URL in a spawned child's env.
 *
 * NOTE ON QUOTED KEYS: env-bag keys below are written as quoted string literals
 * ('SUPABASE_URL', not bare .SUPABASE_URL) matching the existing precedent in
 * tests/unit/vitest-db-project-gated.test.js. This file never touches a live Supabase client
 * (db-target.js, the module under test's own dependency, is itself vitest- and
 * supabase-js-free by design) — the quoting keeps scripts/audit-db-test-guards.mjs's static
 * analysis (which only scans bare-identifier occurrences of these names, deliberately
 * excluding string-literal contexts) from mis-flagging a hermetic test as DB-touching.
 */
import { describe, it, expect } from 'vitest';
import { assertPlaywrightTargetSafe, PRODUCTION_REF } from '../helpers/e2e-db-target-guard.js';

describe('e2e-db-target-guard: assertPlaywrightTargetSafe', () => {
  it('TS-2: a credential-less env (no SUPABASE_URL, no NEXT_PUBLIC_SUPABASE_URL) is not refused', () => {
    expect(() => assertPlaywrightTargetSafe({})).not.toThrow();
  });

  it('TS-3: a designated non-prod ref with a matching VITEST_DB_ALLOW_REF opt-in is not refused', () => {
    const env = {
      'SUPABASE_URL': 'https://myref123abc.supabase.co',
      'SUPABASE_SERVICE_ROLE_KEY': 'k',
      'VITEST_DB_ALLOW_REF': 'myref123abc',
    };
    expect(() => assertPlaywrightTargetSafe(env)).not.toThrow();
  });

  it('TS-4: an undesignated, non-production ref with no opt-in is refused (fail-closed)', () => {
    const env = {
      'SUPABASE_URL': 'https://someotherref.supabase.co',
      'SUPABASE_SERVICE_ROLE_KEY': 'k',
    };
    expect(() => assertPlaywrightTargetSafe(env)).toThrow(/Refused/);
  });

  it(`TS-1 (unit form): the production ref (${PRODUCTION_REF}) is refused with a full env shape`, () => {
    const env = {
      'SUPABASE_URL': `https://${PRODUCTION_REF}.supabase.co`,
      'SUPABASE_SERVICE_ROLE_KEY': 'k',
    };
    // With a full env shape, assessDbTarget's own default-deny (check 1) already refuses
    // (no_designated_target) before check 2's PRODUCTION-specific denylist is even reached --
    // both checks agree the run is unsafe, which is the important invariant here.
    expect(() => assertPlaywrightTargetSafe(env)).toThrow(/Refused/);
  });

  it('TS-7: the production-ref denylist is NOT overridable by VITEST_DB_ALLOW_REF set to the production ref', () => {
    const env = {
      'SUPABASE_URL': `https://${PRODUCTION_REF}.supabase.co`,
      'SUPABASE_SERVICE_ROLE_KEY': 'k',
      'VITEST_DB_ALLOW_REF': PRODUCTION_REF,
    };
    // assessDbTarget alone would return allowed:true here (explicit_opt_in_matches_target) --
    // the independent denylist check must still refuse.
    expect(() => assertPlaywrightTargetSafe(env)).toThrow(/PRODUCTION/);
  });

  describe('TS-8: the three measured GAP-1 bypass shapes are all refused', () => {
    it('(a) SUPABASE_URL=production ref, no service key present (stories-ci.yml\'s exact shape)', () => {
      const env = { 'SUPABASE_URL': `https://${PRODUCTION_REF}.supabase.co` };
      expect(() => assertPlaywrightTargetSafe(env)).toThrow(/PRODUCTION/);
    });

    it('(b) only NEXT_PUBLIC_SUPABASE_URL=production ref set (phase-handoffs.spec.ts\'s own fallback chain)', () => {
      const env = { 'NEXT_PUBLIC_SUPABASE_URL': `https://${PRODUCTION_REF}.supabase.co` };
      expect(() => assertPlaywrightTargetSafe(env)).toThrow(/PRODUCTION/);
    });

    it('(c) production URL + anon key only (no service role key)', () => {
      const env = {
        'SUPABASE_URL': `https://${PRODUCTION_REF}.supabase.co`,
        'SUPABASE_ANON_KEY': 'anon-only',
      };
      expect(() => assertPlaywrightTargetSafe(env)).toThrow(/PRODUCTION/);
    });
  });

  it('a malformed/unrecognisable URL is treated as no-target, not refused', () => {
    const env = { 'SUPABASE_URL': 'not-a-real-url', 'SUPABASE_SERVICE_ROLE_KEY': 'k' };
    expect(() => assertPlaywrightTargetSafe(env)).not.toThrow();
  });
});
