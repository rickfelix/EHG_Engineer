/**
 * SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001 (FR-3/FR-6) — adversarial boundary tests.
 *
 * Proves the FAIL-CLOSED access-control boundary for delegating PRODUCTION apply rights to an AI.
 * These are NOT green-by-construction: they feed destructive / policy / RLS / DML-smuggle vectors
 * and assert REJECTION, and feed legitimate additive + governed-INSERT and assert ALLOW. Mirrors the
 * MIGRATION-TIER-CLASSIFIER lesson: an allow-list boundary must be attacked, not assumed.
 */
import { describe, it, expect } from 'vitest';
import {
  isDelegatableForApply,
  isDelegatableAdditive,
  classifyGovernedInsert,
  isDelegationEnabled,
  DELEGATABLE_INSERT_TABLES,
} from '../../lib/migration/adam-delegated-apply.js';

describe('GAP A — additive delegatable is a STRICT SUBSET of classifier TIER-1 (policy/RLS excluded)', () => {
  it('ALLOWS provably-additive DDL', () => {
    expect(isDelegatableForApply('CREATE TABLE IF NOT EXISTS public.foo (id uuid primary key);').delegatable).toBe(true);
    expect(isDelegatableForApply('CREATE INDEX IF NOT EXISTS idx_foo ON public.foo (id);').delegatable).toBe(true);
    expect(isDelegatableForApply('ALTER TABLE public.foo ADD COLUMN bar text;').delegatable).toBe(true);
  });

  it('REJECTS CREATE POLICY and ENABLE RLS even though the classifier rates them TIER-1 (the GAP-A leak)', () => {
    const pol = isDelegatableForApply('CREATE POLICY p ON public.foo FOR SELECT USING (true);');
    expect(pol.delegatable).toBe(false);
    expect(pol.reason).toMatch(/policy_or_rls_chairman_only|not_delegatable/);
    const rls = isDelegatableForApply('ALTER TABLE public.foo ENABLE ROW LEVEL SECURITY;');
    expect(rls.delegatable).toBe(false);
  });

  it('REJECTS a MIXED-token TIER-1 migration (CREATE TABLE + ENABLE RLS) — the table-suffixed enable_rls token must be caught', () => {
    const mixed = 'CREATE TABLE IF NOT EXISTS public.foo (id uuid primary key);\nALTER TABLE public.foo ENABLE ROW LEVEL SECURITY;';
    const r = isDelegatableAdditive(mixed);
    // If the classifier rates the pair TIER-1, the enable_rls:* token MUST still force not-delegatable.
    expect(r.delegatable).toBe(false);
  });

  it('REJECTS all other access-control vectors (already TIER-2): GRANT / REVOKE / ALTER POLICY / DROP POLICY / GRANT-in-DO / SECURITY DEFINER', () => {
    for (const sql of [
      'GRANT SELECT ON public.foo TO someone;',
      'REVOKE SELECT ON public.foo FROM someone;',
      'ALTER POLICY p ON public.foo USING (true);',
      'DROP POLICY p ON public.foo;',
      'DO $$ BEGIN GRANT SELECT ON public.foo TO someone; END $$;',
      'CREATE FUNCTION f() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;',
    ]) {
      expect(isDelegatableForApply(sql).delegatable, sql).toBe(false);
    }
  });
});

describe('Destructive changes are NEVER delegatable (chairman-only)', () => {
  it('REJECTS DROP / TRUNCATE / RENAME / SET NOT NULL / DELETE / UPDATE', () => {
    for (const sql of [
      'DROP TABLE public.foo;',
      'TRUNCATE public.foo;',
      'ALTER TABLE public.foo RENAME TO bar;',
      'ALTER TABLE public.foo ALTER COLUMN bar SET NOT NULL;',
      'DELETE FROM public.foo;',
      'UPDATE public.foo SET bar = 1;',
    ]) {
      expect(isDelegatableForApply(sql).delegatable, sql).toBe(false);
    }
  });
});

describe('GAP B — governed data-row INSERT: bounded, fail-closed', () => {
  it('ALLOWS a single literal VALUES insert into an allow-listed table', () => {
    const sql = "INSERT INTO vision_ladder_criteria (rung_id, ordinal, capability, today, required) VALUES ('0f056dcd-2d8e-470a-8a28-921d322e6461', 99, 'X', 'a', 'b') ON CONFLICT (rung_id, capability) DO NOTHING;";
    const r = isDelegatableForApply(sql);
    expect(r.delegatable).toBe(true);
    expect(r.kind).toBe('governed_insert');
  });

  it('REJECTS CTE-smuggled DML (WITH x AS (DELETE ...) INSERT ...) — a single statement length check would miss this', () => {
    const sql = "WITH x AS (DELETE FROM conversion_ledger RETURNING *) INSERT INTO vision_ladder_criteria (rung_id, ordinal, capability) VALUES ('u', 1, 'y');";
    const r = classifyGovernedInsert(sql);
    expect(r.delegatable).toBe(false);
    expect(r.reason).toMatch(/cte_not_allowed/);
  });

  it('REJECTS RETURNING, INSERT...SELECT-from-a-relation, non-allow-listed table, multi-statement, DO UPDATE, and comment-hidden 2nd statement', () => {
    const cases = [
      "INSERT INTO vision_ladder_criteria (rung_id, ordinal) VALUES ('u', 1) RETURNING id;",                 // RETURNING
      'INSERT INTO vision_ladder_criteria SELECT * FROM auth.users;',                                          // sub-SELECT from a real relation
      "INSERT INTO secrets (k, v) VALUES ('a', 'b');",                                                         // table not allow-listed
      'INSERT INTO vision_ladder_criteria (ordinal) VALUES (1); DROP TABLE conversion_ledger;',               // multi-statement
      "INSERT INTO vision_ladder_criteria (rung_id, capability) VALUES ('u','c') ON CONFLICT (rung_id, capability) DO UPDATE SET capability = 'z';", // DO UPDATE (mutation)
      'INSERT INTO vision_ladder_criteria (ordinal) VALUES (1) -- \n; DROP TABLE conversion_ledger;',         // comment-hidden 2nd statement
    ];
    for (const sql of cases) {
      expect(classifyGovernedInsert(sql).delegatable, sql).toBe(false);
    }
  });

  it('REJECTS INSERT into an allow-listed table that also references a sensitive relation via JOIN', () => {
    const sql = 'INSERT INTO conversion_ledger (id) SELECT id FROM public.foo JOIN auth.users USING (id);';
    expect(classifyGovernedInsert(sql).delegatable).toBe(false);
  });

  it('the allow-list is the governed set (vision_ladder_criteria, conversion_ledger) — anything else is chairman-only', () => {
    expect(DELEGATABLE_INSERT_TABLES).toContain('vision_ladder_criteria');
    expect(DELEGATABLE_INSERT_TABLES).toContain('conversion_ledger');
    expect(classifyGovernedInsert("INSERT INTO chairman_decisions (decision) VALUES ('go');").delegatable).toBe(false);
  });

  it('CRITICAL — REJECTS function-call / read-server-state expressions inside VALUES (literal-only allow-list, not a deny-list)', () => {
    // These execute AT APPLY TIME and would read files/secrets/run SQL — must all be rejected.
    const exec = [
      "INSERT INTO conversion_ledger (note) VALUES (convert_from(pg_read_binary_file('postgresql.conf'),'UTF8'));",
      "INSERT INTO conversion_ledger (note) VALUES (pg_read_file('/etc/passwd'));",
      "INSERT INTO conversion_ledger (note) VALUES (pg_stat_file('/etc/passwd'));",
      "INSERT INTO conversion_ledger (note) VALUES (pg_ls_dir('/'));",
      "INSERT INTO conversion_ledger (note) VALUES (query_to_xml('SELECT 1', true, true, '')::text);",
      "INSERT INTO conversion_ledger (note) VALUES (dblink_exec('host=evil', 'SELECT 1'));",
      "INSERT INTO conversion_ledger (note) VALUES (current_setting('app.jwt_secret'));",
      'INSERT INTO conversion_ledger (note) VALUES (gen_random_uuid());', // any function call rejected (rely on column default)
    ];
    for (const sql of exec) {
      const r = classifyGovernedInsert(sql);
      expect(r.delegatable, sql).toBe(false);
      expect(r.reason, sql).toMatch(/function_call_in_values/);
    }
  });

  it('CRITICAL — REJECTS bare special value keywords (current_user/session_user) and INSERT...SELECT-without-FROM and DEFAULT VALUES', () => {
    expect(classifyGovernedInsert('INSERT INTO conversion_ledger (note) VALUES (current_user);').delegatable).toBe(false);
    expect(classifyGovernedInsert('INSERT INTO conversion_ledger (note) VALUES (session_user);').delegatable).toBe(false);
    expect(classifyGovernedInsert("INSERT INTO conversion_ledger (note) SELECT current_setting('app.secret');").delegatable).toBe(false); // no-FROM constant SELECT
    expect(classifyGovernedInsert('INSERT INTO conversion_ledger DEFAULT VALUES;').delegatable).toBe(false);
  });

  it('ALLOWS genuine literal VALUES (numbers, quoted strings with escapes, NULL/TRUE/FALSE, ::type casts, multi-row, ON CONFLICT DO NOTHING)', () => {
    const ok = [
      "INSERT INTO vision_ladder_criteria (rung_id, ordinal, capability) VALUES ('0f056dcd-2d8e-470a-8a28-921d322e6461'::uuid, 12, 'Govern-by-exception') ON CONFLICT (rung_id, capability) DO NOTHING;",
      "INSERT INTO conversion_ledger (title, normalized_priority) VALUES ('it''s fine', 3), ('row two', NULL);",
      "INSERT INTO conversion_ledger (title, intake_status) VALUES ('x', 'pending');",
    ];
    for (const sql of ok) {
      const r = classifyGovernedInsert(sql);
      expect(r.delegatable, sql).toBe(true);
      expect(r.kind === undefined || isDelegatableForApply(sql).kind === 'governed_insert').toBeTruthy();
    }
  });
});

describe('Default-deny on degenerate / error input', () => {
  it('REJECTS empty, whitespace, non-string, comment-only', () => {
    for (const sql of ['', '   ', null, undefined, 42, '-- just a comment', '/* x */']) {
      expect(isDelegatableForApply(sql).delegatable, String(sql)).toBe(false);
    }
  });

  it('REJECTS a multi-statement additive+destructive mix', () => {
    expect(isDelegatableForApply('CREATE TABLE public.foo (id int); DROP TABLE public.bar;').delegatable).toBe(false);
  });
});

describe('FR-4 kill-switch — default-OFF, fail-closed (exact sentinel)', () => {
  it('enabled ONLY when the env flag is exactly "on"', () => {
    expect(isDelegationEnabled({ LEO_ADAM_DBAPPLY_DELEGATION: 'on' })).toBe(true);
    expect(isDelegationEnabled({ LEO_ADAM_DBAPPLY_DELEGATION: ' on ' })).toBe(true); // trimmed
  });

  it('disabled (fail-closed) for unset / wrong-case / truthy-looking / typo values', () => {
    for (const v of [undefined, '', 'ON', 'On', 'true', '1', 'yes', 'enabled', 'o n']) {
      expect(isDelegationEnabled({ LEO_ADAM_DBAPPLY_DELEGATION: v }), String(v)).toBe(false);
    }
    expect(isDelegationEnabled({})).toBe(false); // unset => OFF
  });
});
