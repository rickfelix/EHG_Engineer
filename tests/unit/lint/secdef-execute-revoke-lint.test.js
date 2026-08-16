// SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 FR-6. Fixture-driven unit tests for the lint's pure
// logic (extractSecdefFunctions / evaluateFunction / lintFile), per TESTING sub-agent's TS-1
// correction: this tests the CHECKING LOGIC against synthetic fixtures, not today's live/
// ephemeral repo state — the --all sweep of real files is a separate, non-committed check.
import { describe, it, expect } from 'vitest';
import {
  extractSecdefFunctions,
  extractGrantActions,
  evaluateFunction,
  isTransientProbe,
  lintFile,
} from '../../../scripts/lint/secdef-execute-revoke-lint.mjs';

describe('extractSecdefFunctions', () => {
  it('finds a CREATE FUNCTION ... SECURITY DEFINER', () => {
    const sql = 'CREATE FUNCTION public.foo(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;';
    expect(extractSecdefFunctions(sql).map((f) => f.name)).toEqual(['foo']);
  });

  it('does NOT flag a SECURITY INVOKER function (the default, not this lint\'s concern)', () => {
    const sql = 'CREATE FUNCTION public.foo() RETURNS void LANGUAGE sql SECURITY INVOKER AS $$ SELECT 1 $$;';
    expect(extractSecdefFunctions(sql)).toEqual([]);
  });

  it('does NOT flag a function with no SECURITY clause at all (defaults to INVOKER)', () => {
    const sql = 'CREATE FUNCTION public.foo() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;';
    expect(extractSecdefFunctions(sql)).toEqual([]);
  });

  it('handles CREATE OR REPLACE FUNCTION', () => {
    const sql = 'CREATE OR REPLACE FUNCTION public.bar() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;';
    expect(extractSecdefFunctions(sql).map((f) => f.name)).toEqual(['bar']);
  });

  it('correctly bounds a SECURITY DEFINER lookahead to before the NEXT CREATE FUNCTION (a later function is not misattributed)', () => {
    const sql = `
      CREATE FUNCTION public.invoker_one() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
      CREATE FUNCTION public.definer_two() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
    `;
    const names = extractSecdefFunctions(sql).map((f) => f.name);
    expect(names).toEqual(['definer_two']);
    expect(names).not.toContain('invoker_one');
  });
});

describe('evaluateFunction — TS-2: PUBLIC omitted from the REVOKE FROM list', () => {
  it('flags a REVOKE naming only anon, authenticated (PUBLIC omitted) as non-compliant', () => {
    const sql = `
      CREATE FUNCTION public.foo() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON FUNCTION public.foo() FROM anon, authenticated;
    `;
    const { compliant, reasons } = evaluateFunction(sql, 'foo');
    expect(compliant).toBe(false);
    expect(reasons.some((r) => r.includes('PUBLIC'))).toBe(true);
  });
});

describe('evaluateFunction — TS-3: a compliant fixture passes', () => {
  it('a REVOKE naming PUBLIC, anon, authenticated is fully compliant', () => {
    const sql = `
      CREATE FUNCTION public.foo() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON FUNCTION public.foo() FROM PUBLIC, anon, authenticated;
    `;
    const { compliant, reasons } = evaluateFunction(sql, 'foo');
    expect(compliant).toBe(true);
    expect(reasons).toEqual([]);
  });
});

describe('evaluateFunction — TS-2b: PUBLIC revoked but a DIRECT anon grant left standing', () => {
  it('flags REVOKE FROM PUBLIC alone (anon untouched) as non-compliant — PUBLIC cannot remove a direct anon grant', () => {
    const sql = `
      CREATE FUNCTION public.foo() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON FUNCTION public.foo() FROM PUBLIC;
    `;
    const { compliant, reasons } = evaluateFunction(sql, 'foo');
    expect(compliant).toBe(false);
    expect(reasons.some((r) => r.includes('anon'))).toBe(true);
  });

  it('the legitimate re-grant branch is NOT flagged — PUBLIC+anon+authenticated revoked, anon explicitly re-granted later', () => {
    // Mirrors 20260815_venture_user_feedback_ownership_rpc.sql's real, legitimate pattern: a
    // function that SHOULD be anon-callable revokes broadly then re-grants deliberately.
    const sql = `
      CREATE FUNCTION public.foo() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON FUNCTION public.foo() FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.foo() TO anon;
    `;
    const { compliant, reasons } = evaluateFunction(sql, 'foo');
    expect(compliant).toBe(true);
    expect(reasons).toEqual([]);
  });
});

describe('isTransientProbe', () => {
  it('a function created and DROPped in the same file is exempt (self-contained migration-time probe)', () => {
    const sql = `
      CREATE FUNCTION public._probe() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      DROP FUNCTION public._probe();
    `;
    expect(isTransientProbe(sql, '_probe')).toBe(true);
  });

  it('a function with no matching DROP is NOT transient — the general rule applies', () => {
    const sql = 'CREATE FUNCTION public.persists() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;';
    expect(isTransientProbe(sql, 'persists')).toBe(false);
  });
});

describe('lintFile — end-to-end fixture scan', () => {
  it('TS-4 equivalent: scans a fixture regardless of which of the 3 scoped directories it claims to be from (directory scoping itself is exercised by listScopedFiles/CLI, not lintFile)', () => {
    const sql = `
      CREATE FUNCTION public.needs_fix() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON FUNCTION public.needs_fix() FROM anon, authenticated;
    `;
    const findings = lintFile(sql, 'database/chairman-gated/fake_fixture.sql', {});
    expect(findings).toHaveLength(1);
    expect(findings[0].function).toBe('needs_fix');
  });

  it('an allowlisted function with a documented reason is skipped even if it would otherwise violate', () => {
    const sql = 'CREATE FUNCTION public.allowed() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;';
    const findings = lintFile(sql, 'database/migrations/fake.sql', { allowed: { reason: 'documented exception' } });
    expect(findings).toEqual([]);
  });

  it('a clean fixture with zero SECURITY DEFINER functions produces zero findings', () => {
    const sql = 'CREATE TABLE public.foo (id uuid PRIMARY KEY);';
    expect(lintFile(sql, 'database/migrations/fake.sql', {})).toEqual([]);
  });
});
