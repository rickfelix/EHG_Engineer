/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 -- FR-4 AC-2/AC-3: the 2 A2 integrity checks,
 * fully mocked (no live database touched in this unit tier) -- proves each check's LOGIC is
 * correct in both directions: passes when the invariant holds, fails when it is violated
 * (adversarial simulation, proving the check is not vacuously true).
 *
 * The live-database confirmation that the invariant actually holds TODAY (TS-5, TS-6) is a
 * separate db-tier test: tests/database/org-acceptance-suite-integrity.db.test.js.
 */
import { describe, it, expect } from 'vitest';
import { check as baseImmutableCheck } from '../../../../lib/org/acceptance-suite/checks/integrity/base-immutable.mjs';
import { check as normsUnwritableCheck } from '../../../../lib/org/acceptance-suite/checks/integrity/norms-unwritable.mjs';

function mockSupabaseColumnAbsent() {
  return { from: () => ({ select: () => ({ limit: async () => ({ error: { code: '42703', message: 'column does not exist' } }) }) }) };
}
function mockSupabaseColumnPresent() {
  return { from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
}
function mockDbClientNoOffendingGrants() {
  return { query: async () => ({ rows: [] }), end: async () => {} };
}
function mockDbClientOffendingGrants() {
  return { query: async () => ({ rows: [{ grantee: 'authenticated', privilege_type: 'SELECT' }] }), end: async () => {} };
}

describe('base-immutable-from-venture-context (FR-4a)', () => {
  it('passes when venture_id is absent and grants are service_role-only', async () => {
    const result = await baseImmutableCheck(null, {
      supabase: mockSupabaseColumnAbsent(),
      createDatabaseClient: async () => mockDbClientNoOffendingGrants(),
    });
    expect(result.passed).toBe(true);
  });

  it('TS-7: fails when a venture_id column is present (adversarial simulation -- not vacuously true)', async () => {
    const result = await baseImmutableCheck(null, {
      supabase: mockSupabaseColumnPresent(),
      createDatabaseClient: async () => mockDbClientNoOffendingGrants(),
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/venture_id/);
  });

  it('fails when RLS grants extend beyond service_role, even with venture_id absent', async () => {
    const result = await baseImmutableCheck(null, {
      supabase: mockSupabaseColumnAbsent(),
      createDatabaseClient: async () => mockDbClientOffendingGrants(),
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/grants extend beyond service_role/);
  });
});

describe('norms-unwritable-by-agents (FR-4b)', () => {
  it('passes when norms is absent', async () => {
    const result = await normsUnwritableCheck(null, { supabase: mockSupabaseColumnAbsent() });
    expect(result.passed).toBe(true);
  });

  it('TS-7: fails when a norms column is present (adversarial simulation -- not vacuously true)', async () => {
    const result = await normsUnwritableCheck(null, { supabase: mockSupabaseColumnPresent() });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/norms/);
  });
});
