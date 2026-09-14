/**
 * SD-LEO-INFRA-STOP-ORG-ROLE-001 (E2): unit-level coverage for the CI check's own
 * drift-detection logic, offline (mocked supabase) -- the live workflow
 * (.github/workflows/org-agent-roles-canonical-titles-guard.yml) exercises the real DB.
 */
import { describe, it, expect } from 'vitest';
import { checkCanonicalTitles } from '../../../scripts/lint/org-agent-roles-canonical-titles-check.mjs';
import { computeCanonicalRoleTitles } from '../../../lib/org/canonical-role-titles.mjs';

function fakeSupabase(rows) {
  return {
    from(table) {
      if (table !== 'org_agent_roles') throw new Error(`unexpected table: ${table}`);
      return { select: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) };
    },
  };
}

describe('checkCanonicalTitles', () => {
  it('reports zero drift when every known role title matches canonical', async () => {
    const supabase = fakeSupabase([
      { role_key: 'VENTURE_CEO', title: 'CEO' },
      { role_key: 'VP_STRATEGY', title: 'VP Strategy' },
    ]);
    const result = await checkCanonicalTitles(supabase);
    expect(result.drifted).toEqual([]);
  });

  it('flags a role whose title has been clobbered with a venture-specific name', async () => {
    const supabase = fakeSupabase([
      { role_key: 'VENTURE_CEO', title: 'TEST-abc123-SD-A CEO' },
      { role_key: 'VP_STRATEGY', title: 'VP Strategy' },
    ]);
    const result = await checkCanonicalTitles(supabase);
    expect(result.drifted).toEqual([
      { role_key: 'VENTURE_CEO', current_title: 'TEST-abc123-SD-A CEO', expected_title: 'CEO' },
    ]);
  });

  it('ignores a role_key the current template does not define (never a false positive on retired/unknown roles)', async () => {
    const supabase = fakeSupabase([{ role_key: 'SOME_RETIRED_ROLE', title: 'Anything At All' }]);
    const result = await checkCanonicalTitles(supabase);
    expect(result.drifted).toEqual([]);
  });

  it('propagates a real select error rather than silently reporting no drift', async () => {
    const supabase = {
      from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'connection refused' } }) }) }),
    };
    await expect(checkCanonicalTitles(supabase)).rejects.toThrow('connection refused');
  });

  // VALIDATION finding (LEAD-TO-PLAN, evidence 5363c1ea): the drift check alone only iterates
  // rows the table RETURNS -- an emptied/truncated table would read as a false green (0 checked,
  // 0 drifted). `missing` must close that coverage gap.
  it('flags every known role_key as MISSING when the table is empty -- an emptied table is never a false green', async () => {
    const supabase = fakeSupabase([]);
    const result = await checkCanonicalTitles(supabase);
    expect(result.drifted).toEqual([]);
    expect(result.missing.length).toBe(computeCanonicalRoleTitles().size);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('flags a specific known role_key as missing when only it is absent from an otherwise-complete table', async () => {
    const allButOne = [...computeCanonicalRoleTitles()]
      .filter(([roleKey]) => roleKey !== 'VP_STRATEGY')
      .map(([role_key, title]) => ({ role_key, title }));
    const supabase = fakeSupabase(allButOne);
    const result = await checkCanonicalTitles(supabase);
    expect(result.drifted).toEqual([]);
    expect(result.missing).toEqual([{ role_key: 'VP_STRATEGY', expected_title: 'VP Strategy' }]);
  });

  it('a fully-present, fully-correct table reports zero drift AND zero missing', async () => {
    const complete = [...computeCanonicalRoleTitles()].map(([role_key, title]) => ({ role_key, title }));
    const supabase = fakeSupabase(complete);
    const result = await checkCanonicalTitles(supabase);
    expect(result.drifted).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.checked).toBe(result.expected_count);
  });

  // TS-5 (PRD test_scenarios): an otherwise-complete table (every role present) with exactly
  // ONE drifted title reports that single role in `drifted` and `missing` stays empty --
  // TESTING sub-agent finding (PLAN_TO_EXEC, evidence fd0cf503): this exact shape (complete +
  // one-drift) had only been probed ad hoc, never asserted as a named test.
  it('TS-5: an otherwise-complete table with exactly one drifted title reports only that role, missing stays empty', async () => {
    const complete = [...computeCanonicalRoleTitles()].map(([role_key, title]) => ({ role_key, title }));
    const poisoned = complete.map((row) =>
      row.role_key === 'VENTURE_CEO' ? { ...row, title: 'TEST-poison-SD-Z CEO' } : row,
    );
    const supabase = fakeSupabase(poisoned);
    const result = await checkCanonicalTitles(supabase);
    expect(result.drifted).toEqual([
      { role_key: 'VENTURE_CEO', current_title: 'TEST-poison-SD-Z CEO', expected_title: 'CEO' },
    ]);
    expect(result.missing).toEqual([]);
    expect(result.checked).toBe(result.expected_count);
  });
});
