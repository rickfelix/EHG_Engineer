// SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 FR-6. Fixture-driven unit tests for the lint's pure
// logic (extractSecdefFunctions / evaluateFunction / lintFile), per TESTING sub-agent's TS-1
// correction: this tests the CHECKING LOGIC against synthetic fixtures, not today's live/
// ephemeral repo state — the --all sweep of real files is a separate, non-committed check.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractSecdefFunctions,
  evaluateFunction,
  isTransientProbe,
  lintFile,
  listScopedFiles,
  stripSqlComments,
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
  it('a function created and DROPped (same signature) AFTER the CREATE is exempt (self-contained migration-time probe)', () => {
    const sql = `
      CREATE FUNCTION public._probe() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      DROP FUNCTION public._probe();
    `;
    const [{ args, createEndIdx }] = extractSecdefFunctions(sql);
    expect(isTransientProbe(sql, '_probe', args, createEndIdx)).toBe(true);
  });

  it('a function with no matching DROP is NOT transient — the general rule applies', () => {
    const sql = 'CREATE FUNCTION public.persists() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;';
    const [{ args, createEndIdx }] = extractSecdefFunctions(sql);
    expect(isTransientProbe(sql, 'persists', args, createEndIdx)).toBe(false);
  });

  it('accepts the guarded DROP FUNCTION IF EXISTS form for a genuine create-then-drop probe', () => {
    const sql = `
      CREATE FUNCTION public._probe(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      DROP FUNCTION IF EXISTS public._probe(uuid);
    `;
    const [{ args, createEndIdx }] = extractSecdefFunctions(sql);
    expect(isTransientProbe(sql, '_probe', args, createEndIdx)).toBe(true);
  });

  it('MUST-CATCH (E4/S3, TESTING+SECURITY sub-agent finding): a DROP-then-CREATE — the standard signature-change idiom, where the function PERSISTS after the file runs — is NOT exempt just because the same name appears in an earlier DROP', () => {
    const sql = `
      DROP FUNCTION public.evil_fn(uuid);
      CREATE FUNCTION public.evil_fn(p uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
    `;
    const [{ args, createEndIdx }] = extractSecdefFunctions(sql);
    expect(isTransientProbe(sql, 'evil_fn', args, createEndIdx)).toBe(false);
    // ...and with no REVOKE at all, this is a real, un-exempted finding end-to-end.
    const findings = lintFile(sql, 'database/migrations/fake.sql', {});
    expect(findings).toHaveLength(1);
    expect(findings[0].function).toBe('evil_fn');
  });

  it('MUST-CATCH (E4/S3): a DROP of a DIFFERENT overload after CREATE does not wrongly exempt this signature', () => {
    const sql = `
      CREATE FUNCTION public.evil_fn(p uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      DROP FUNCTION public.evil_fn(text);
    `;
    const [{ args, createEndIdx }] = extractSecdefFunctions(sql);
    expect(isTransientProbe(sql, 'evil_fn', args, createEndIdx)).toBe(false);
  });
});

describe('stripSqlComments — S4 (SECURITY sub-agent finding): a REVOKE that exists only inside a comment must not satisfy the lint', () => {
  it('a REVOKE inside a -- line comment does not count as compliance', () => {
    const sql = `
      CREATE FUNCTION public.foo() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      -- REVOKE EXECUTE ON FUNCTION public.foo() FROM PUBLIC, anon, authenticated;
    `;
    const findings = lintFile(sql, 'database/migrations/fake.sql', {});
    expect(findings).toHaveLength(1);
    expect(findings[0].function).toBe('foo');
  });

  it('a REVOKE inside a /* */ block comment does not count as compliance', () => {
    const sql = `
      CREATE FUNCTION public.foo() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      /* REVOKE EXECUTE ON FUNCTION public.foo() FROM PUBLIC, anon, authenticated; */
    `;
    const findings = lintFile(sql, 'database/migrations/fake.sql', {});
    expect(findings).toHaveLength(1);
    expect(findings[0].function).toBe('foo');
  });

  it('a genuine (non-commented) REVOKE still satisfies compliance after comment stripping', () => {
    const sql = `
      -- some header comment
      CREATE FUNCTION public.foo() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON FUNCTION public.foo() FROM PUBLIC, anon, authenticated;
    `;
    expect(lintFile(sql, 'database/migrations/fake.sql', {})).toEqual([]);
  });

  it('stripSqlComments removes both comment forms while preserving surrounding code', () => {
    const sql = 'SELECT 1; -- trailing comment\n/* block\ncomment */ SELECT 2;';
    const stripped = stripSqlComments(sql);
    expect(stripped).not.toContain('trailing comment');
    expect(stripped).not.toContain('block');
    expect(stripped).toContain('SELECT 1;');
    expect(stripped).toContain('SELECT 2;');
  });
});

describe('lintFile — end-to-end fixture scan', () => {
  it('the per-file logic itself is path-agnostic: a violation is caught the same way regardless of which scoped directory the file path claims to be from (the directory-SCOPING decision belongs to listScopedFiles, tested separately below for TS-4)', () => {
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

describe('listScopedFiles — TS-4: --all mode scans database/chairman-gated/, not just database/migrations/', () => {
  let tmpRoot;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secdef-lint-ts4-'));
    fs.mkdirSync(path.join(tmpRoot, 'database', 'migrations'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'database', 'chairman-gated'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'supabase', 'migrations'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'database', 'migrations', 'a_migrations_fixture.sql'), '-- fixture');
    fs.writeFileSync(path.join(tmpRoot, 'database', 'chairman-gated', 'b_chairman_gated_fixture.sql'), '-- fixture');
    fs.writeFileSync(path.join(tmpRoot, 'supabase', 'migrations', 'c_supabase_migrations_fixture.sql'), '-- fixture');
    // A non-.sql file in a scoped dir must never be picked up.
    fs.writeFileSync(path.join(tmpRoot, 'database', 'chairman-gated', 'README.md'), '# not sql');
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('--all includes the database/chairman-gated/ fixture, not just database/migrations/', () => {
    const files = listScopedFiles('all', tmpRoot);
    const normalized = files.map((f) => f.split(path.sep).join('/'));
    expect(normalized).toContain('database/chairman-gated/b_chairman_gated_fixture.sql');
    expect(normalized).toContain('database/migrations/a_migrations_fixture.sql');
    expect(normalized).toContain('supabase/migrations/c_supabase_migrations_fixture.sql');
  });

  it('--all does not pick up non-.sql files even inside a scoped directory', () => {
    const files = listScopedFiles('all', tmpRoot);
    expect(files.some((f) => f.endsWith('README.md'))).toBe(false);
  });
});
