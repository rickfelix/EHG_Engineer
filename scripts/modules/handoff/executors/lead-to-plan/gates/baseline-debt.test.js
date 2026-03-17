/**
 * Tests for Baseline Debt Check Gate (LEAD-TO-PLAN)
 * SD-LEO-INFRA-HANDOFF-VALIDATOR-REGISTRY-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkBaselineDebt, createBaselineDebtGate } from './baseline-debt.js';
import { createMockSD, createMockSupabase, assertValidatorResult } from '../../../../../../tests/factories/validator-context-factory.js';

describe('checkBaselineDebt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass when RPC returns PASS with no issues', async () => {
    const sd = createMockSD();
    const supabase = createMockSupabase({
      rpcData: {
        verdict: 'PASS',
        total_open_count: 2,
        stale_critical_count: 0,
        owned_issues_count: 1,
        issues: [],
        warnings: [],
      },
    });

    const result = await checkBaselineDebt(sd, supabase);

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
  });

  it('should pass with warning score when RPC returns PASS with warnings', async () => {
    const sd = createMockSD();
    const supabase = createMockSupabase({
      rpcData: {
        verdict: 'PASS',
        total_open_count: 12,
        stale_critical_count: 0,
        owned_issues_count: 3,
        issues: [],
        warnings: ['Baseline debt growing: 12 open issues across all categories'],
      },
    });

    const result = await checkBaselineDebt(sd, supabase);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(80);
    expect(result.warnings.length).toBe(1);
    expect(result.details.totalOpen).toBe(12);
  });

  it('should fail when RPC returns BLOCKED with stale critical issues', async () => {
    const sd = createMockSD();
    const supabase = createMockSupabase({
      rpcData: {
        verdict: 'BLOCKED',
        total_open_count: 15,
        stale_critical_count: 3,
        owned_issues_count: 0,
        issues: ['3 critical baseline issues unaddressed for >30 days'],
        warnings: [],
      },
    });

    const result = await checkBaselineDebt(sd, supabase);

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.details.staleCritical).toBe(3);
  });

  it('should pass with warning when RPC is unavailable and baseline table missing', async () => {
    const supabase = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'RPC not found' } }),
      from: () => ({
        select: () => ({
          select: () => ({}),
          eq: () => ({}),
          then: (fn) => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).then(fn),
          [Symbol.toStringTag]: 'Promise',
        }),
      }),
    };
    // Make from().select() thenable to resolve as the error case
    const chainable = {
      then: (fn) => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).then(fn),
    };
    supabase.from = () => ({
      select: () => chainable,
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    });

    const sd = createMockSD();
    const result = await checkBaselineDebt(sd, supabase);

    expect(result.pass).toBe(true);
    expect(result.warnings.some(w => w.includes('not available'))).toBe(true);
  });

  it('should pass with warning on unexpected error (error fallback)', async () => {
    const sd = createMockSD();
    const supabase = {
      rpc: () => { throw new Error('Connection refused'); },
    };

    const result = await checkBaselineDebt(sd, supabase);

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(90);
    expect(result.warnings.some(w => w.includes('Connection refused'))).toBe(true);
  });
});

describe('createBaselineDebtGate', () => {
  it('should return a gate object with correct shape', () => {
    const supabase = createMockSupabase();
    const gate = createBaselineDebtGate(supabase);

    expect(gate.name).toBe('BASELINE_DEBT_CHECK');
    expect(gate.required).toBe(true);
    expect(gate.weight).toBe(0.8);
    expect(typeof gate.validator).toBe('function');
    expect(typeof gate.remediation).toBe('string');
  });

  it('should invoke checkBaselineDebt via the validator', async () => {
    const supabase = createMockSupabase({
      rpcData: {
        verdict: 'PASS',
        total_open_count: 0,
        stale_critical_count: 0,
        owned_issues_count: 0,
        issues: [],
        warnings: [],
      },
    });

    const gate = createBaselineDebtGate(supabase);
    const sd = createMockSD();
    const result = await gate.validator({ sd });

    assertValidatorResult(result, expect);
    expect(result.pass).toBe(true);
  });
});
