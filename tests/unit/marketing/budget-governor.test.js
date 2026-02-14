/**
 * Budget Governor Tests
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkBudget, recordSpend, getBudgetSummary, resetDailySpend } from '../../../lib/marketing/budget-governor.js';

function createMockSupabase(overrides = {}) {
  const mock = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockResolvedValue({ error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides
  };
  mock.from.mockReturnValue(mock);
  return mock;
}

describe('checkBudget', () => {
  it('should allow when no budget configured', async () => {
    const supabase = createMockSupabase();
    supabase.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const result = await checkBudget(supabase, 'v-1', 'x');

    expect(result.allowed).toBe(true);
    expect(result.budget).toBeNull();
  });

  it('should allow when within budget', async () => {
    const supabase = createMockSupabase();
    supabase.single.mockResolvedValue({
      data: {
        id: 'b-1',
        monthly_budget_cents: 10000,
        current_month_spend_cents: 5000,
        current_day_spend_cents: 100,
        daily_limit_cents: 500,
        daily_stop_loss_multiplier: 3,
        budget_month: new Date().toISOString().substring(0, 7),
        status: 'active'
      },
      error: null
    });

    const result = await checkBudget(supabase, 'v-1', 'x', 100);

    expect(result.allowed).toBe(true);
    expect(result.budget).toBeDefined();
  });

  it('should block when monthly budget exceeded', async () => {
    const supabase = createMockSupabase();
    supabase.single.mockResolvedValue({
      data: {
        id: 'b-1',
        monthly_budget_cents: 10000,
        current_month_spend_cents: 9950,
        current_day_spend_cents: 100,
        daily_limit_cents: null,
        daily_stop_loss_multiplier: 3,
        budget_month: new Date().toISOString().substring(0, 7),
        status: 'active'
      },
      error: null
    });

    const result = await checkBudget(supabase, 'v-1', 'x', 100);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Monthly budget exceeded');
  });

  it('should block when daily limit exceeded', async () => {
    const supabase = createMockSupabase();
    supabase.single.mockResolvedValue({
      data: {
        id: 'b-1',
        monthly_budget_cents: 10000,
        current_month_spend_cents: 2000,
        current_day_spend_cents: 490,
        daily_limit_cents: 500,
        daily_stop_loss_multiplier: 3,
        budget_month: new Date().toISOString().substring(0, 7),
        status: 'active'
      },
      error: null
    });

    const result = await checkBudget(supabase, 'v-1', 'x', 20);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily budget exceeded');
  });

  it('should reset budget when month changes', async () => {
    const supabase = createMockSupabase();
    supabase.single.mockResolvedValue({
      data: {
        id: 'b-1',
        monthly_budget_cents: 10000,
        current_month_spend_cents: 9999,
        current_day_spend_cents: 500,
        daily_limit_cents: 500,
        daily_stop_loss_multiplier: 3,
        budget_month: '2025-01', // Old month
        status: 'active'
      },
      error: null
    });

    const result = await checkBudget(supabase, 'v-1', 'x');

    expect(result.allowed).toBe(true);
    // Should have called update to reset
    expect(supabase.from).toHaveBeenCalledWith('channel_budgets');
  });
});

describe('recordSpend', () => {
  it('should update spend counters', async () => {
    const supabase = createMockSupabase();
    supabase.single.mockResolvedValue({
      data: {
        id: 'b-1',
        current_month_spend_cents: 1000,
        current_day_spend_cents: 100,
        monthly_budget_cents: 10000
      },
      error: null
    });

    await recordSpend(supabase, 'v-1', 'x', 50);

    expect(supabase.from).toHaveBeenCalledWith('channel_budgets');
  });

  it('should do nothing when no budget exists', async () => {
    const supabase = createMockSupabase();
    supabase.single.mockResolvedValue({ data: null, error: null });

    await recordSpend(supabase, 'v-1', 'x', 50);
    // Should not throw
  });
});

describe('getBudgetSummary', () => {
  it('should return formatted budget summary', async () => {
    const supabase = createMockSupabase();
    // Override eq to return data directly for select chain
    const mockData = [
      {
        platform: 'x',
        monthly_budget_cents: 10000,
        current_month_spend_cents: 5000,
        current_day_spend_cents: 200,
        status: 'active'
      },
      {
        platform: 'bluesky',
        monthly_budget_cents: 5000,
        current_month_spend_cents: 1000,
        current_day_spend_cents: 50,
        status: 'active'
      }
    ];

    supabase.eq.mockResolvedValue({ data: mockData });

    const summary = await getBudgetSummary(supabase, 'v-1');

    expect(summary).toHaveLength(2);
    expect(summary[0].platform).toBe('x');
    expect(summary[0].monthlyBudget).toBe(100); // cents to dollars
    expect(summary[0].monthlySpend).toBe(50);
    expect(summary[0].utilization).toBe(50); // 50%
    expect(summary[1].platform).toBe('bluesky');
  });

  it('should return empty array when no budgets', async () => {
    const supabase = createMockSupabase();
    supabase.eq.mockResolvedValue({ data: null });

    const summary = await getBudgetSummary(supabase, 'v-1');

    expect(summary).toEqual([]);
  });
});

describe('resetDailySpend', () => {
  it('should reset daily spend for all budgets', async () => {
    const supabase = createMockSupabase();

    await resetDailySpend(supabase);

    expect(supabase.from).toHaveBeenCalledWith('channel_budgets');
  });
});
