/**
 * SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001 — rls-anon-tenant-predicate-lint's new
 * (table, policy)-keyed exemption mechanism, added because this SD's own
 * public_surface_canary_anon_read policy is a DELIBERATE unconditional anon SELECT (the
 * positive-canary invariant, FR-3) and the lint previously had no accommodation for a
 * genuinely-intended instance of the shape it flags. Mirrors the established sibling
 * precedent scripts/sentinels/exempted-tables.json (audit-security-linter.mjs).
 */
import { describe, it, expect } from 'vitest';
import { isExemptPolicy, lintSql } from '../../../scripts/lint/rls-anon-tenant-predicate-lint.mjs';
import exemptions from '../../../scripts/lint/rls-anon-tenant-predicate-lint-exemptions.json' with { type: 'json' };

describe('isExemptPolicy — the exemptions.json allowlist', () => {
  it('the live exemptions file lists the canary table+policy pair this SD added', () => {
    expect(exemptions.exempted_policies).toContainEqual(
      expect.objectContaining({ table: 'public_surface_canary', policy: 'public_surface_canary_anon_read' })
    );
  });

  it('returns true for the exact exempted (table, policy) pair', () => {
    expect(isExemptPolicy('public_surface_canary', 'public_surface_canary_anon_read')).toBe(true);
  });

  it('returns false for the same policy name on a DIFFERENT table (no blanket name-match)', () => {
    expect(isExemptPolicy('some_other_table', 'public_surface_canary_anon_read')).toBe(false);
  });

  it('returns false for a DIFFERENT policy name on the exempted table (no blanket table-match)', () => {
    expect(isExemptPolicy('public_surface_canary', 'some_other_policy')).toBe(false);
  });

  it('returns false for an unrelated table/policy entirely', () => {
    expect(isExemptPolicy('companies', 'anon read companies')).toBe(false);
  });
});

describe('lintSql — exemption suppresses ONLY the exact exempted instance', () => {
  it('suppresses the exempted canary policy (0 violations)', () => {
    const sql = `CREATE POLICY public_surface_canary_anon_read ON public.public_surface_canary FOR SELECT TO anon, authenticated USING (true);`;
    expect(lintSql(sql)).toHaveLength(0);
  });

  it('still flags an unconditional-true policy on a DIFFERENT table with the SAME policy name', () => {
    const sql = `CREATE POLICY public_surface_canary_anon_read ON public.completely_different_table FOR SELECT TO anon USING (true);`;
    const violations = lintSql(sql);
    expect(violations).toHaveLength(1);
    expect(violations[0].violationClass).toBe('unconditional_anon_select');
  });

  it('still flags an unconditional-true policy on the SAME table with a DIFFERENT policy name', () => {
    const sql = `CREATE POLICY some_other_policy ON public.public_surface_canary FOR SELECT TO anon USING (true);`;
    const violations = lintSql(sql);
    expect(violations).toHaveLength(1);
  });

  it('the real migration file scans clean (exempted, not merely undetected)', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const path = await import('path');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const migrationPath = path.join(__dirname, '../../../database/migrations/20260915_continuous_external_surface_allowlist_and_canary.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    expect(lintSql(sql, migrationPath)).toHaveLength(0);
  });
});
