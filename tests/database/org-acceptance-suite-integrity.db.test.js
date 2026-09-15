/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 -- TS-5, TS-6: confirms the 2 A2 integrity
 * checks pass against the LIVE database today (read-only -- no writes, so safe to run against
 * the real project unlike a seed-then-assert db test).
 */
import { describe, it, expect } from 'vitest';
import { check as baseImmutableCheck } from '../../lib/org/acceptance-suite/checks/integrity/base-immutable.mjs';
import { check as normsUnwritableCheck } from '../../lib/org/acceptance-suite/checks/integrity/norms-unwritable.mjs';

describe('TS-5: base-immutable-from-venture-context passes against the live schema', () => {
  it('org_role_base_versions has no venture_id column and RLS grants are service_role-only', async () => {
    const result = await baseImmutableCheck(null);
    expect(result.passed, result.reason).toBe(true);
  });
});

describe('TS-6: norms-unwritable-by-agents passes against the live schema', () => {
  it('org_role_venture_overlays has no norms column', async () => {
    const result = await normsUnwritableCheck(null);
    expect(result.passed, result.reason).toBe(true);
  });
});
