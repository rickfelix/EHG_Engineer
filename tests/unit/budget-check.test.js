/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-1.
 *
 * TS-2: a seeded-then-exhausted venture_token_budgets row still halts fail-closed.
 * TS-12: a seeded-adequate venture_token_budgets row does NOT halt.
 *
 * PLAN-VERIFICATION VALIDATION evidence (c7ce2e04) found tests/unit/seed-active-venture-budgets.test.js
 * claimed these two scenarios were "covered by budget-check.js's own pre-existing behavior" but no
 * such unit test exists — the only other checkBudgetOrThrow reference in the repo is a differently-
 * shaped e2e spec calling an unrelated budgetManager.checkBudgetOrThrow(scenario, amount) method.
 * This file directly exercises the real lib/governance/budget-check.js against a mocked Supabase
 * client, closing that gap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseChainMock } from '../helpers/supabase-chain-mock.js';

const chain = createSupabaseChainMock();

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => chain
}));

const { checkBudgetOrThrow } = await import('../../lib/governance/budget-check.js');
const { BudgetExhaustedError, CrewGovernanceViolationError } = await import('../../lib/exceptions/index.js');

describe('checkBudgetOrThrow — TS-2: seeded-then-exhausted still halts fail-closed', () => {
  beforeEach(() => {
    chain.single.mockReset();
  });

  it('throws BudgetExhaustedError when venture_token_budgets.budget_remaining <= 0', async () => {
    chain.single.mockResolvedValueOnce({ data: { budget_remaining: 0, budget_allocated: 100000 }, error: null });

    await expect(checkBudgetOrThrow('v-exhausted')).rejects.toThrow(BudgetExhaustedError);
  });

  it('throws BudgetExhaustedError on a negative remaining balance too', async () => {
    chain.single.mockResolvedValueOnce({ data: { budget_remaining: -50, budget_allocated: 100000 }, error: null });

    await expect(checkBudgetOrThrow('v-negative')).rejects.toThrow(BudgetExhaustedError);
  });

  it('falls back to venture_phase_budgets and still halts when that is exhausted too', async () => {
    chain.single
      .mockResolvedValueOnce({ data: null, error: null }) // no venture_token_budgets row
      .mockResolvedValueOnce({ data: { budget_remaining: 0, budget_allocated: 20000 }, error: null }); // exhausted phase budget

    await expect(checkBudgetOrThrow('v-phase-exhausted')).rejects.toThrow(BudgetExhaustedError);
  });

  it('throws CrewGovernanceViolationError(NO_BUDGET_RECORD) when neither table has a row', async () => {
    chain.single
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(checkBudgetOrThrow('v-unseeded')).rejects.toThrow(CrewGovernanceViolationError);
  });
});

describe('checkBudgetOrThrow — TS-12: seeded-adequate does NOT halt', () => {
  beforeEach(() => {
    chain.single.mockReset();
  });

  it('resolves normally when venture_token_budgets has a positive remaining balance', async () => {
    chain.single.mockResolvedValueOnce({ data: { budget_remaining: 5000, budget_allocated: 100000 }, error: null });

    const result = await checkBudgetOrThrow('v-adequate');
    expect(result).toEqual({ remaining: 5000, allocated: 100000 });
  });

  it('resolves normally via the venture_phase_budgets fallback when it has a positive balance', async () => {
    chain.single
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { budget_remaining: 1234, budget_allocated: 20000 }, error: null });

    const result = await checkBudgetOrThrow('v-phase-adequate');
    expect(result).toEqual({ remaining: 1234, allocated: 20000 });
  });
});
