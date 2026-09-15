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

  it('reports an accurate reason (not "carries a venture_id column") when the probe itself errors unexpectedly', async () => {
    const mockSupabaseUnexpectedError = {
      from: () => ({ select: () => ({ limit: async () => ({ error: { code: '08006', message: 'connection failure' } }) }) }),
    };
    const result = await baseImmutableCheck(null, { supabase: mockSupabaseUnexpectedError });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/unexpected error probing/);
    expect(result.reason).not.toMatch(/carries a venture_id column/);
  });

  // EXEC-TO-PLAN SECURITY review: deps.supabase / deps.createDatabaseClient exist only for this
  // suite's own unit-test mocking (see file header of checks/integrity/_shared.mjs). Outside a
  // test runner they must be IGNORED, not honored -- otherwise any future caller of
  // check(organization, deps) could pass a mock that forces this security-critical check to
  // always report passed:true regardless of the real database state.
  it('ignores injected deps outside a test environment (falls through to the real client path)', async () => {
    const originalVitest = process.env.VITEST;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalUrl = process.env.SUPABASE_URL;
    const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      // A mock that would trivially report passed:true if it were honored.
      const alwaysPassMock = { from: () => ({ select: () => ({ limit: async () => ({ error: { code: '42703' } }) }) }) };
      // With the guard active, this injected mock is ignored and the check falls through to
      // building a real supabase-js client from (now-empty) env vars, which throws synchronously
      // ("supabaseUrl is required.") rather than returning the mock's passed:true result.
      await expect(baseImmutableCheck(null, { supabase: alwaysPassMock })).rejects.toThrow();
    } finally {
      if (originalVitest === undefined) delete process.env.VITEST; else process.env.VITEST = originalVitest;
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
      if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
      if (originalPublicUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
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
