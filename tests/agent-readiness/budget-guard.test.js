import { describe, it, expect, vi, beforeEach } from 'vitest';

// PRD TS-5: budget cap halts an over-budget run, measured not assumed. All Supabase/deep-research
// calls mocked — zero live network/DB. Chainable Supabase mock keeps the real .from().select()...
// shape so a signature drift in the real client would show up as a broken mock, not a silent pass.

let maybeSingleResult = { data: null };
const selectCalls = [];
const updateCalls = [];
const insertCalls = [];

function chain() {
  return {
    select: (...args) => { selectCalls.push(args); return chain2(); },
    update: (payload) => { updateCalls.push(payload); return { eq: () => Promise.resolve({ data: null, error: null }) }; },
    insert: (payload) => { insertCalls.push(payload); return Promise.resolve({ data: null, error: null }); }
  };
}
function chain2() {
  return {
    eq: () => chain2(),
    maybeSingle: () => Promise.resolve(maybeSingleResult)
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => chain() })
}));

const estimateCostMock = vi.fn(() => 0.001);
const checkBudgetMock = vi.fn(async () => ({ allowed: true }));
const recordCostMock = vi.fn(async () => {});
const getBudgetStatusMock = vi.fn(async () => []);
vi.mock('../../lib/research/deep-research-budget.js', () => ({
  estimateCost: (...args) => estimateCostMock(...args),
  checkBudget: (...args) => checkBudgetMock(...args),
  recordCost: (...args) => recordCostMock(...args),
  getBudgetStatus: (...args) => getBudgetStatusMock(...args)
}));

const {
  preflightBudgetCheck, recordActualCost, midRunAlertCheck, ensureCapSeeded, AUDIT_PROVIDER_KEY, _internal
} = await import('../../lib/agent-readiness/budget-guard.js');

beforeEach(() => {
  maybeSingleResult = { data: null };
  selectCalls.length = 0; updateCalls.length = 0; insertCalls.length = 0;
  estimateCostMock.mockClear();
  checkBudgetMock.mockReset().mockResolvedValue({ allowed: true });
  recordCostMock.mockClear();
  getBudgetStatusMock.mockReset().mockResolvedValue([]);
});

describe('budget-guard (FR-6/US-011) — TS-5: budget cap halts an over-budget run', () => {
  it('TS-5: preflightBudgetCheck returns allowed:false with a reason when checkBudget disallows', async () => {
    checkBudgetMock.mockResolvedValueOnce({ allowed: false, reason: 'daily cap exceeded' });
    const result = await preflightBudgetCheck({ promptCount: 5, modelSet: ['anthropic:claude-opus-5', 'openai:gpt-5'], samplesPerCell: 5, env: {} });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('daily cap exceeded');
  });

  it('TS-5: estimated cost scales with promptCount x modelSet.length x samplesPerCell — the guard measures the actual fan-out size, not a fixed estimate', async () => {
    await preflightBudgetCheck({ promptCount: 5, modelSet: ['anthropic:claude-opus-5', 'openai:gpt-5'], samplesPerCell: 5, env: {} });
    const [, estimatedCost] = checkBudgetMock.mock.calls[0];
    // 5 prompts x 2 models x 5 replicates = 50 cells total, split 25/25 across the two models x estimateCost() per call
    expect(estimatedCost).toBeCloseTo(0.001 * 50, 6);
  });

  it('preflightBudgetCheck estimates PER MODEL FAMILY, not a single flat AUDIT_PROVIDER_KEY rate — the exact defect adversarial review caught on PR #7113 (estimateCost(AUDIT_PROVIDER_KEY,...) silently fell back to the anthropic rate regardless of modelSet)', async () => {
    await preflightBudgetCheck({ promptCount: 1, modelSet: ['anthropic:claude-opus-5', 'openai:gpt-5', 'google:gemini-3'], samplesPerCell: 1, env: {} });
    const familiesCalled = estimateCostMock.mock.calls.map((c) => c[0]);
    expect(familiesCalled).toEqual(['anthropic', 'openai', 'google']);
    expect(familiesCalled).not.toContain(AUDIT_PROVIDER_KEY);
  });

  it('preflightBudgetCheck calls checkBudget with the AUDIT_PROVIDER_KEY, not deep-research\'s own key', async () => {
    await preflightBudgetCheck({ promptCount: 1, modelSet: ['anthropic:claude-opus-5'], samplesPerCell: 1, env: {} });
    expect(checkBudgetMock).toHaveBeenCalledWith(AUDIT_PROVIDER_KEY, expect.any(Number));
  });

  it('when allowed, returns allowed:true with the estimated cost and resolved cap', async () => {
    const result = await preflightBudgetCheck({ promptCount: 1, modelSet: ['anthropic:claude-opus-5'], samplesPerCell: 1, env: { AUDIT_BUDGET_CAP_USD: '2.5' } });
    expect(result.allowed).toBe(true);
    expect(result.capUsd).toBe(2.5);
  });
});

describe('budget-guard — familyOf', () => {
  it('extracts the family from a "family:model" entry', () => {
    expect(_internal.familyOf('anthropic:claude-opus-5')).toBe('anthropic');
    expect(_internal.familyOf('openai:gpt-5')).toBe('openai');
  });

  it('returns the whole string unchanged when there is no colon (defensive, should not happen given audit-runner.js validates this shape)', () => {
    expect(_internal.familyOf('claude-opus-5')).toBe('claude-opus-5');
  });
});

describe('budget-guard — ensureCapSeeded (idempotent per day)', () => {
  it('inserts a fresh row with the env cap when no row exists yet today', async () => {
    maybeSingleResult = { data: null };
    const cap = await ensureCapSeeded({ AUDIT_BUDGET_CAP_USD: '3' });
    expect(cap).toBe(3);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({ provider: AUDIT_PROVIDER_KEY, daily_cap_usd: 3, total_cost_usd: 0, call_count: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it('updates daily_cap_usd when a row exists with a DIFFERENT cap — only that field, never total_cost_usd/call_count', async () => {
    maybeSingleResult = { data: { id: 'row-1', daily_cap_usd: 5 } };
    await ensureCapSeeded({ AUDIT_BUDGET_CAP_USD: '8' });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({ daily_cap_usd: 8 });
    expect(insertCalls).toHaveLength(0);
  });

  it('is a true no-op when the existing cap already matches — no write at all', async () => {
    maybeSingleResult = { data: { id: 'row-1', daily_cap_usd: 5 } };
    await ensureCapSeeded({ AUDIT_BUDGET_CAP_USD: '5' });
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });
});

describe('budget-guard — capFromEnv fallback behavior', () => {
  it('falls back to the $5 default when AUDIT_BUDGET_CAP_USD is absent, zero, negative, or non-numeric', () => {
    expect(_internal.capFromEnv({})).toBe(5);
    expect(_internal.capFromEnv({ AUDIT_BUDGET_CAP_USD: '0' })).toBe(5);
    expect(_internal.capFromEnv({ AUDIT_BUDGET_CAP_USD: '-1' })).toBe(5);
    expect(_internal.capFromEnv({ AUDIT_BUDGET_CAP_USD: 'not-a-number' })).toBe(5);
  });

  it('uses the env value when it is a valid positive number', () => {
    expect(_internal.capFromEnv({ AUDIT_BUDGET_CAP_USD: '12.5' })).toBe(12.5);
  });
});

describe('budget-guard — recordActualCost / midRunAlertCheck', () => {
  it('recordActualCost forwards to recordCost under AUDIT_PROVIDER_KEY', async () => {
    await recordActualCost(1.23);
    expect(recordCostMock).toHaveBeenCalledWith(AUDIT_PROVIDER_KEY, 1.23);
  });

  it('midRunAlertCheck signals alert:true once spend crosses the 90% threshold', async () => {
    getBudgetStatusMock.mockResolvedValueOnce([{ provider: AUDIT_PROVIDER_KEY, total_cost_usd: 4.6, daily_cap_usd: 5 }]);
    const result = await midRunAlertCheck({});
    expect(result.alert).toBe(true);
    expect(result.ratio).toBeCloseTo(0.92, 2);
  });

  it('midRunAlertCheck does not alert below the threshold', async () => {
    getBudgetStatusMock.mockResolvedValueOnce([{ provider: AUDIT_PROVIDER_KEY, total_cost_usd: 1, daily_cap_usd: 5 }]);
    const result = await midRunAlertCheck({});
    expect(result.alert).toBe(false);
  });
});
