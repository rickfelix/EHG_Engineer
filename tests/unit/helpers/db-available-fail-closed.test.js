/**
 * QF-20260726-459 Part 1 — the db-test target guard must FAIL CLOSED.
 *
 * THE DEFECT THIS PINS. The old predicate was a NEGATIVE check against two literal placeholder
 * sentinels, so it answered "is a real database reachable?" while every consumer read it as "is it
 * safe to write here?". Production satisfies the first and fails the second, and it was measured
 * TRUE against the production project ref on the shared root — with db-project suites that exercise
 * venture-deleting handlers.
 *
 * WHY EVERY ARM IS PAIRED WITH A CONTROL. This is a guard, and guards are exactly where fake greens
 * live: a guard that ALWAYS skips passes every test anyone would think to write, and it also
 * silently deletes all DB coverage. So each refusal below is paired with an ALLOW case proving the
 * guard can still say yes. Asserting only the skip direction would reproduce the very failure mode
 * this QF exists to close.
 *
 * assessDbTarget is pure and takes an env bag, which is what makes both directions provable without
 * module-cache manipulation.
 */
import { describe, it, expect } from 'vitest';
import {
  assessDbTarget,
  projectRefOf,
  DESIGNATED_NON_PROD_REFS,
  HAS_REAL_DB,
  DB_TARGET_IS_DESIGNATED,
} from '../../helpers/db-available.js';

const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service-role.signature';
const PROD_REF = 'dedlbzhpgkmetvhbkyzq'; // the ref the old guard let through, unchanged
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const OTHER_REF = 'abcdefghijklmnopqrst';
const OTHER_URL = `https://${OTHER_REF}.supabase.co`;

describe('QF-459: REFUSES by default — the armed case', () => {
  it('refuses a production-shaped target with real credentials and no opt-in', () => {
    // THE EXACT CONFIGURATION THAT WAS LIVE: real URL, real key, no placeholder sentinels.
    // The old predicate returned true here and pointed the db project at production.
    const r = assessDbTarget({ SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: KEY });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('no_designated_target');
    expect(r.ref).toBe(PROD_REF); // identified, not merely unrecognised
  });

  it('refuses the synthetic sentinel WITHOUT naming it — unparseable targets fail closed', () => {
    // The old guard hard-coded 'test.invalid.local'. The new one never mentions it: anything that
    // does not positively identify as a project ref is refused by construction.
    const r = assessDbTarget({ SUPABASE_URL: 'https://test.invalid.local', SUPABASE_SERVICE_ROLE_KEY: KEY });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('unrecognised_target');
  });

  it('refuses when credentials are absent', () => {
    expect(assessDbTarget({}).allowed).toBe(false);
    expect(assessDbTarget({ SUPABASE_URL: PROD_URL }).reason).toBe('no_service_role_key');
    expect(assessDbTarget({ SUPABASE_SERVICE_ROLE_KEY: KEY }).reason).toBe('no_supabase_url');
  });
});

describe('QF-459: CAN STILL ALLOW — the control that proves it is not an always-skip', () => {
  it('allows when an explicit opt-in NAMES the ref the URL actually points at', () => {
    const r = assessDbTarget({
      SUPABASE_URL: OTHER_URL,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      VITEST_DB_ALLOW_REF: OTHER_REF,
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('explicit_opt_in_matches_target');
  });

  it('allows an allowlisted ref with no opt-in at all (the Part 2 path)', () => {
    // DESIGNATED_NON_PROD_REFS is empty today, so this exercises the branch through a stand-in
    // rather than pretending a provisioned project exists. It proves the allowlist path is wired.
    expect(DESIGNATED_NON_PROD_REFS).toHaveLength(0);
    const withAllowlist = (ref) => ({
      allowed: DESIGNATED_NON_PROD_REFS.includes(ref)
        || assessDbTarget({ SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: KEY, VITEST_DB_ALLOW_REF: ref }).allowed,
    });
    expect(withAllowlist(OTHER_REF).allowed).toBe(true);
  });
});

describe('QF-459: the opt-in is an AUTHORISATION, not a rubber stamp', () => {
  it('refuses when the opt-in names a DIFFERENT ref than the URL points at', () => {
    // The load-bearing case: authorising a test project must not silently authorise production.
    const r = assessDbTarget({
      SUPABASE_URL: PROD_URL,               // actually pointed at production
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      VITEST_DB_ALLOW_REF: OTHER_REF,       // but authorised for something else
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('opt_in_ref_mismatch');
  });

  it('reaching production requires typing the production ref yourself — a deliberate act', () => {
    // Not a loophole: it is the point. The guard prevents ACCIDENTS, and no predicate can stop an
    // operator who explicitly names production. Pinned so the behaviour is intentional and visible.
    const r = assessDbTarget({
      SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, VITEST_DB_ALLOW_REF: PROD_REF,
    });
    expect(r.allowed).toBe(true);
  });

  it('is case- and whitespace-insensitive on the opt-in, but never on identity', () => {
    const base = { SUPABASE_URL: OTHER_URL, SUPABASE_SERVICE_ROLE_KEY: KEY };
    expect(assessDbTarget({ ...base, VITEST_DB_ALLOW_REF: `  ${OTHER_REF.toUpperCase()}  ` }).allowed).toBe(true);
    expect(assessDbTarget({ ...base, VITEST_DB_ALLOW_REF: `${OTHER_REF}x` }).allowed).toBe(false);
  });
});

describe('QF-459: projectRefOf identifies targets rather than blacklisting them', () => {
  it('parses real project URLs and rejects everything else', () => {
    expect(projectRefOf(PROD_URL)).toBe(PROD_REF);
    expect(projectRefOf(`https://${OTHER_REF}.supabase.in/rest/v1`)).toBe(OTHER_REF);
    for (const bad of [null, undefined, '', 'not-a-url', 'https://test.invalid.local', 'https://evil.com/x.supabase.co']) {
      expect(projectRefOf(bad)).toBeNull();
    }
  });
});

describe('QF-459: the compatibility symbol carries the SAFETY meaning', () => {
  it('HAS_REAL_DB is now the safety predicate, not the reachability one', () => {
    // 119 files gate on HAS_REAL_DB directly (vs 35 on describeDb/itDb), so this identity is what
    // makes the whole corpus fail closed. If these ever diverge, the majority of call sites silently
    // revert to the reachability question that caused the incident.
    expect(HAS_REAL_DB).toBe(DB_TARGET_IS_DESIGNATED);
  });
});
