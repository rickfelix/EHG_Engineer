import { describe, it, expect, vi, beforeEach } from 'vitest';

// PRD TS-1/TS-2: no-fallback and no-cache behavior of runAudit(). All dependencies mocked so this
// runs with zero live network/DB calls — these are exactly the CI-feasible checks the ceremony
// deferral (TS-3/4/7/8/9/11) does NOT cover.

const completeMock = vi.fn();
const getProviderAdapterMock = vi.fn(() => ({ complete: completeMock }));
vi.mock('../../lib/sub-agents/vetting/provider-adapters.js', () => ({
  getProviderAdapter: (...args) => getProviderAdapterMock(...args)
}));

const writeSampleMock = vi.fn(async () => ({ written: true }));
vi.mock('../../lib/agent-readiness/sample-writer.js', () => ({
  writeSample: (...args) => writeSampleMock(...args)
}));

const registerAuditRunMock = vi.fn(async () => ({ id: 'run-1', expected_sample_count: 2 }));
vi.mock('../../lib/agent-readiness/run-registry.js', () => ({
  registerAuditRun: (...args) => registerAuditRunMock(...args)
}));

const preflightBudgetCheckMock = vi.fn(async () => ({ allowed: true, estimatedCostUsd: 0.01, capUsd: 5 }));
const recordActualCostMock = vi.fn(async () => {});
vi.mock('../../lib/agent-readiness/budget-guard.js', () => ({
  preflightBudgetCheck: (...args) => preflightBudgetCheckMock(...args),
  recordActualCost: (...args) => recordActualCostMock(...args)
}));

vi.mock('../../lib/agent-readiness/prompt-sets.js', () => ({
  resolvePromptSet: () => ['prompt one'],
  promptCountFor: () => 1
}));

const { runAudit, _internal } = await import('../../lib/agent-readiness/audit-runner.js');

function baseParams(overrides = {}) {
  return {
    ventureUrl: 'https://example.invalid',
    ventureLabel: 'Example',
    runType: 'before',
    stageTag: 'dogfood_internal',
    modelSet: ['anthropic:claude-opus-5'],
    samplesPerCell: 1,
    ...overrides
  };
}

describe('audit-runner (FR-1/US-002) — TS-1: no-fallback', () => {
  beforeEach(() => {
    completeMock.mockReset();
    getProviderAdapterMock.mockClear();
    writeSampleMock.mockClear();
  });

  it('TS-1/AC-002-1: requests the adapter with fallbackEnabled:false — the no-fallback flag is actually wired, not just claimed', async () => {
    completeMock.mockResolvedValue({ model: 'claude-opus-5', content: 'I recommend this business.', usage: {} });
    await runAudit(baseParams());
    expect(getProviderAdapterMock).toHaveBeenCalledWith('anthropic', { fallbackEnabled: false });
  });

  it('TS-1/AC-002-4: a persistently-failing sample writes NOTHING — no row, never a substituted model', async () => {
    completeMock.mockRejectedValue(new Error('429 rate limited'));
    const result = await runAudit(baseParams());
    expect(writeSampleMock).not.toHaveBeenCalled();
    expect(result.written).toBe(0);
    expect(result.refused).toBe(1);
  });

  it('a successful sample IS written, with actual_responder_model taken from the real result, not assumed', async () => {
    completeMock.mockResolvedValue({ model: 'claude-opus-5', content: 'not familiar with this business', usage: {} });
    await runAudit(baseParams());
    expect(writeSampleMock).toHaveBeenCalledTimes(1);
    const call = writeSampleMock.mock.calls[0][0];
    expect(call.requestedModel).toBe('claude-opus-5');
    expect(call.actualResponderModel).toBe('claude-opus-5');
  });
});

describe('audit-runner (FR-1/US-002) — TS-2: no-cache', () => {
  beforeEach(() => {
    completeMock.mockReset();
    writeSampleMock.mockClear();
  });

  it('TS-2: cache_hit is always written false — this call path (provider-adapters.js) has no caching to disable', async () => {
    completeMock.mockResolvedValue({ model: 'claude-opus-5', content: 'a plain answer', usage: {} });
    await runAudit(baseParams());
    expect(writeSampleMock).toHaveBeenCalledTimes(1);
    expect(writeSampleMock.mock.calls[0][0].cacheHit).toBe(false);
  });

  it('TS-2: identical back-to-back calls each hit the adapter independently — no memoization/cache layer short-circuits a repeat prompt', async () => {
    completeMock.mockResolvedValue({ model: 'claude-opus-5', content: 'a plain answer', usage: {} });
    await runAudit(baseParams());
    await runAudit(baseParams());
    expect(completeMock).toHaveBeenCalledTimes(2);
  });
});

describe('audit-runner — budget guard integration (FR-6)', () => {
  it('refuses to run when the budget guard disallows, and never calls the adapter', async () => {
    preflightBudgetCheckMock.mockResolvedValueOnce({ allowed: false, reason: 'over daily cap', estimatedCostUsd: 9.99, capUsd: 5 });
    await expect(runAudit(baseParams())).rejects.toThrow(/budget guard/i);
    expect(getProviderAdapterMock).not.toHaveBeenCalled();
  });
});

describe('audit-runner internals', () => {
  it('familyModel requires "family:model" form', () => {
    expect(_internal.familyModel('anthropic:claude-opus-5')).toEqual({ family: 'anthropic', model: 'claude-opus-5' });
    expect(() => _internal.familyModel('claude-opus-5')).toThrow();
  });

  it('classifyResponse treats an explicit "not familiar" as not-found, not a false negative', () => {
    expect(_internal.classifyResponse("I'm not familiar with that business.").found).toBe(false);
  });
});
