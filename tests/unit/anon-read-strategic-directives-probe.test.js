/**
 * Unit tier for scripts/anon-read-strategic-directives-probe.mjs -- SD-LEO-FIX-CLOSE-ANON-KEY-001 FR-2.
 *
 * Pure-function tier only (discoverAnonReadableTables / diffAgainstAllowlist / isAlwaysFalse /
 * isSessionGated). The live assertion against strategic_directives_v2 runs as a separate CI step
 * that invokes the script directly with a real DATABASE_URL (mirroring
 * .github/workflows/anon-write-contract-probe.yml) -- this repo's vitest `db` project has an empty
 * DESIGNATED_NON_PROD_REFS, so a live-tier test placed there would SKIP and report green, which is
 * strictly worse than not having the test at all. This suite pins the LOGIC that decides the exit
 * code; the workflow's live step pins the FACT.
 */
import { describe, it, expect } from 'vitest';
import {
  discoverAnonReadableTables,
  diffAgainstAllowlist,
  isAlwaysFalse,
  isSessionGated,
  ANON_READ_ALLOWLIST,
} from '../../scripts/anon-read-strategic-directives-probe.mjs';

describe('isAlwaysFalse', () => {
  it('recognizes every always-false spelling', () => {
    expect(isAlwaysFalse('false')).toBe(true);
    expect(isAlwaysFalse('(false)')).toBe(true);
    expect(isAlwaysFalse('1=0')).toBe(true);
    expect(isAlwaysFalse('(1 = 0)')).toBe(true);
    expect(isAlwaysFalse('null')).toBe(true); // the literal string 'NULL', not a JS null qual
  });

  it('does not misclassify a real predicate as always-false', () => {
    expect(isAlwaysFalse('true')).toBe(false);
    expect(isAlwaysFalse("(status = 'published')")).toBe(false);
  });
});

describe('isSessionGated', () => {
  it('flags predicates the anon key can never satisfy', () => {
    expect(isSessionGated('(auth.uid() = user_id)')).toBe(true);
    expect(isSessionGated("(auth.role() = 'service_role'::text)")).toBe(true);
    expect(isSessionGated("((auth.jwt() ->> 'role'::text) = 'chairman'::text)")).toBe(true);
    expect(isSessionGated('fn_is_chairman()')).toBe(true);
    expect(isSessionGated('fn_user_has_venture_access(venture_id)')).toBe(true);
  });

  it('does not flag an unconditional or status-based predicate', () => {
    expect(isSessionGated('true')).toBe(false);
    expect(isSessionGated("(status = 'active')")).toBe(false);
  });

  it('adversarial review finding: does NOT flag a jwt()->>role check against \'anon\' -- that IS genuinely anon-readable, since the anon key\'s own JWT carries role=anon', () => {
    expect(isSessionGated("((auth.jwt() ->> 'role'::text) = 'anon'::text)")).toBe(false);
  });

  it('still flags a jwt()->>role check against a real restrictive role', () => {
    expect(isSessionGated("((auth.jwt() ->> 'role'::text) = 'service_role'::text)")).toBe(true);
    expect(isSessionGated("((auth.jwt() ->> 'role'::text) = 'chairman'::text)")).toBe(true);
  });
});

describe('discoverAnonReadableTables', () => {
  it('includes a table with an unconditional PERMISSIVE anon SELECT policy', () => {
    const rows = [{ tablename: 'strategic_directives_v2', roles: ['anon'], cmd: 'SELECT', qual: 'true', permissive: 'PERMISSIVE' }];
    expect(discoverAnonReadableTables(rows)).toEqual(['strategic_directives_v2']);
  });

  it('excludes a RESTRICTIVE policy -- it can only narrow, never grant', () => {
    const rows = [{ tablename: 't', roles: ['anon'], cmd: 'SELECT', qual: 'true', permissive: 'RESTRICTIVE' }];
    expect(discoverAnonReadableTables(rows)).toEqual([]);
  });

  it('excludes an always-false deny policy even when roles include anon', () => {
    const rows = [{ tablename: 't', roles: ['anon'], cmd: 'ALL', qual: 'false', permissive: 'PERMISSIVE' }];
    expect(discoverAnonReadableTables(rows)).toEqual([]);
  });

  it('excludes a policy gated by a session-scoped auth function', () => {
    const rows = [{ tablename: 't', roles: ['public'], cmd: 'SELECT', qual: '(auth.uid() = user_id)', permissive: 'PERMISSIVE' }];
    expect(discoverAnonReadableTables(rows)).toEqual([]);
  });

  it('includes a table reachable only via the public role, not just anon', () => {
    const rows = [{ tablename: 't', roles: ['public'], cmd: 'ALL', qual: 'true', permissive: 'PERMISSIVE' }];
    expect(discoverAnonReadableTables(rows)).toEqual(['t']);
  });

  it('excludes a policy scoped to authenticated only', () => {
    const rows = [{ tablename: 't', roles: ['authenticated'], cmd: 'SELECT', qual: 'true', permissive: 'PERMISSIVE' }];
    expect(discoverAnonReadableTables(rows)).toEqual([]);
  });

  it('the coexistence case that made two tables look anon-readable until measured: a deny policy '
    + 'alongside an authenticated-only SELECT grants nothing to anon', () => {
    const rows = [
      { tablename: 'protocol_improvement_queue', roles: ['anon'], cmd: 'ALL', qual: 'false', permissive: 'PERMISSIVE' },
      { tablename: 'protocol_improvement_queue', roles: ['authenticated'], cmd: 'SELECT', qual: 'true', permissive: 'PERMISSIVE' },
    ];
    expect(discoverAnonReadableTables(rows)).toEqual([]);
  });

  it('adversarial review finding: includes a table gated by jwt()->>role = \'anon\' -- genuinely anon-readable, must not be masked', () => {
    const rows = [{ tablename: 't', roles: ['public'], cmd: 'SELECT', qual: "((auth.jwt() ->> 'role'::text) = 'anon'::text)", permissive: 'PERMISSIVE' }];
    expect(discoverAnonReadableTables(rows)).toEqual(['t']);
  });

  it('dedupes multiple qualifying policies on the same table', () => {
    const rows = [
      { tablename: 't', roles: ['anon'], cmd: 'SELECT', qual: 'true', permissive: 'PERMISSIVE' },
      { tablename: 't', roles: ['public'], cmd: 'ALL', qual: 'true', permissive: 'PERMISSIVE' },
    ];
    expect(discoverAnonReadableTables(rows)).toEqual(['t']);
  });
});

describe('diffAgainstAllowlist', () => {
  it('reports strategic_directives_v2 as unexpected -- it is deliberately absent from the allow-list', () => {
    const { ok, unexpected } = diffAgainstAllowlist(['strategic_directives_v2', 'leo_agents'], ['leo_agents']);
    expect(ok).toBe(false);
    expect(unexpected).toEqual(['strategic_directives_v2']);
  });

  it('passes once the discovered set matches the allow-list exactly (the post-FR-3 state)', () => {
    const { ok, unexpected } = diffAgainstAllowlist(['leo_agents', 'feedback'], ['leo_agents', 'feedback']);
    expect(ok).toBe(true);
    expect(unexpected).toEqual([]);
  });

  it('flags a brand-new anon-readable table that is not on the frozen baseline -- the preventive half', () => {
    const { ok, unexpected } = diffAgainstAllowlist(['leo_agents', 'some_new_table'], ['leo_agents']);
    expect(ok).toBe(false);
    expect(unexpected).toEqual(['some_new_table']);
  });
});

describe('ANON_READ_ALLOWLIST', () => {
  it('never contains strategic_directives_v2 -- that is the one entry this SD removes', () => {
    expect(ANON_READ_ALLOWLIST).not.toContain('strategic_directives_v2');
  });

  it('is a non-empty, deduplicated, sorted baseline', () => {
    expect(ANON_READ_ALLOWLIST.length).toBeGreaterThan(0);
    expect(new Set(ANON_READ_ALLOWLIST).size).toBe(ANON_READ_ALLOWLIST.length);
    expect([...ANON_READ_ALLOWLIST].sort()).toEqual([...ANON_READ_ALLOWLIST]);
  });
});
