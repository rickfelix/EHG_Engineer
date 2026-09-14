/**
 * SD-LEO-INFRA-STOP-ORG-ROLE-001: unit coverage for the one-off restoration script's
 * findRepairTargets() (pure diff logic, offline/mocked supabase).
 */
import { describe, it, expect } from 'vitest';
import { findRepairTargets } from '../../../scripts/one-off/restore-org-agent-roles-canonical-titles.mjs';

function fakeSupabase(rows) {
  return {
    from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) }),
  };
}

describe('findRepairTargets', () => {
  it('finds exactly the rows whose title differs from canonical', async () => {
    const supabase = fakeSupabase([
      { role_key: 'VENTURE_CEO', title: 'TEST-x CEO' },
      { role_key: 'VP_STRATEGY', title: 'VP Strategy' }, // already correct
      { role_key: 'FINANCE_BILLING_OPERATOR', title: 'EHG Finance/Billing Operator' }, // already correct
    ]);
    const targets = await findRepairTargets(supabase);
    expect(targets).toEqual([
      { role_key: 'VENTURE_CEO', current_title: 'TEST-x CEO', expected_title: 'CEO' },
    ]);
  });

  it('returns an empty array when nothing needs repair', async () => {
    const supabase = fakeSupabase([{ role_key: 'VENTURE_CEO', title: 'CEO' }]);
    expect(await findRepairTargets(supabase)).toEqual([]);
  });

  it('never targets a role_key outside the current template', async () => {
    const supabase = fakeSupabase([{ role_key: 'NOT_A_REAL_ROLE', title: 'Whatever' }]);
    expect(await findRepairTargets(supabase)).toEqual([]);
  });
});
