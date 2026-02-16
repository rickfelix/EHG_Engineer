/**
 * Unit tests for EVA Event Bus handlers
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-E
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleVentureCreated } from '../../../lib/eva/event-bus/handlers/venture-created.js';
import { handleVentureKilled } from '../../../lib/eva/event-bus/handlers/venture-killed.js';
import { handleBudgetExceeded } from '../../../lib/eva/event-bus/handlers/budget-exceeded.js';
import { handleChairmanOverride } from '../../../lib/eva/event-bus/handlers/chairman-override.js';
import { handleStageFailed } from '../../../lib/eva/event-bus/handlers/stage-failed.js';

function createMockSupabase(overrides = {}) {
  const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: 'v-1', name: 'Test Venture', status: 'active' },
      error: null,
    }),
  };

  return {
    from: vi.fn((table) => {
      if (overrides[table]) return overrides[table];
      return {
        insert: insertFn,
        ...updateChain,
        ...selectChain,
      };
    }),
    _insertFn: insertFn,
  };
}

describe('handleVentureCreated', () => {
  it('should log venture creation to audit trail', async () => {
    const supabase = createMockSupabase();
    const result = await handleVentureCreated(
      { ventureId: 'v-1', name: 'Test', createdBy: 'user1' },
      { supabase, ventureId: 'v-1' }
    );

    expect(result.outcome).toBe('venture_initialized');
    expect(result.ventureId).toBe('v-1');
    expect(supabase.from).toHaveBeenCalledWith('eva_ventures');
    expect(supabase.from).toHaveBeenCalledWith('eva_audit_log');
  });

  it('should throw non-retryable error when ventureId missing', async () => {
    const supabase = createMockSupabase();
    try {
      await handleVentureCreated({}, { supabase });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('ventureId is required');
      expect(err.retryable).toBe(false);
    }
  });

  it('should throw when venture not found in database', async () => {
    const supabase = createMockSupabase({
      eva_ventures: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    try {
      await handleVentureCreated({ ventureId: 'v-999' }, { supabase });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('Venture not found');
      expect(err.retryable).toBe(false);
    }
  });
});

describe('handleVentureKilled', () => {
  it('should update venture status and log to audit', async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = createMockSupabase({
      eva_ventures: {
        update: vi.fn().mockReturnValue({ eq: updateEq }),
      },
    });

    const result = await handleVentureKilled(
      { ventureId: 'v-1', reason: 'Failed KPI', killedBy: 'chairman' },
      { supabase, ventureId: 'v-1' }
    );

    expect(result.outcome).toBe('venture_killed');
    expect(result.ventureId).toBe('v-1');
  });

  it('should throw non-retryable error when ventureId missing', async () => {
    const supabase = createMockSupabase();
    try {
      await handleVentureKilled({}, { supabase });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('ventureId is required');
      expect(err.retryable).toBe(false);
    }
  });

  it('should throw when venture status update fails', async () => {
    const supabase = createMockSupabase({
      eva_ventures: {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'update failed' } }),
        }),
      },
    });

    try {
      await handleVentureKilled({ ventureId: 'v-1' }, { supabase });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('Failed to update venture status');
    }
  });
});

describe('handleBudgetExceeded', () => {
  it('should log budget exceeded and escalate to chairman', async () => {
    const supabase = createMockSupabase();
    const result = await handleBudgetExceeded(
      { ventureId: 'v-1', currentBudget: 150000, threshold: 100000, overage: 50000 },
      { supabase, ventureId: 'v-1' }
    );

    expect(result.outcome).toBe('budget_escalated');
    expect(result.ventureId).toBe('v-1');
    expect(result.overage).toBe(50000);
    expect(supabase.from).toHaveBeenCalledWith('eva_audit_log');
    expect(supabase.from).toHaveBeenCalledWith('chairman_decisions');
  });

  it('should throw non-retryable error when ventureId missing', async () => {
    const supabase = createMockSupabase();
    try {
      await handleBudgetExceeded({}, { supabase });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('ventureId is required');
      expect(err.retryable).toBe(false);
    }
  });

  it('should succeed even if chairman_decisions table is missing', async () => {
    const insertCount = { calls: 0 };
    const supabase = createMockSupabase({
      chairman_decisions: {
        insert: vi.fn().mockRejectedValue(new Error('relation does not exist')),
      },
      eva_audit_log: {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    });

    // Override from to route correctly
    supabase.from = vi.fn((table) => {
      if (table === 'chairman_decisions') {
        return { insert: vi.fn().mockRejectedValue(new Error('relation does not exist')) };
      }
      return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });

    const result = await handleBudgetExceeded(
      { ventureId: 'v-1', currentBudget: 150000, threshold: 100000, overage: 50000 },
      { supabase, ventureId: 'v-1' }
    );

    expect(result.outcome).toBe('budget_escalated');
  });
});

describe('handleChairmanOverride', () => {
  it('should log override and mark decision as applied', async () => {
    const supabase = createMockSupabase();
    const result = await handleChairmanOverride(
      { ventureId: 'v-1', decisionId: 'd-1', overrideType: 'budget_increase', value: 200000 },
      { supabase, ventureId: 'v-1' }
    );

    expect(result.outcome).toBe('override_applied');
    expect(result.ventureId).toBe('v-1');
    expect(result.overrideType).toBe('budget_increase');
  });

  it('should throw non-retryable error when ventureId or overrideType missing', async () => {
    const supabase = createMockSupabase();
    try {
      await handleChairmanOverride({ ventureId: 'v-1' }, { supabase });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('overrideType are required');
      expect(err.retryable).toBe(false);
    }
  });

  it('should skip decision update when no decisionId provided', async () => {
    const supabase = createMockSupabase();
    const result = await handleChairmanOverride(
      { ventureId: 'v-1', overrideType: 'force_advance' },
      { supabase, ventureId: 'v-1' }
    );

    expect(result.outcome).toBe('override_applied');
  });
});

describe('handleStageFailed', () => {
  it('should log stage failure to audit trail', async () => {
    const supabase = createMockSupabase();
    const result = await handleStageFailed(
      { ventureId: 'v-1', stageId: 's-3', reason: 'KPI miss', failureType: 'error' },
      { supabase, ventureId: 'v-1' }
    );

    expect(result.outcome).toBe('failure_logged');
    expect(result.ventureId).toBe('v-1');
    expect(result.stageId).toBe('s-3');
    expect(supabase.from).toHaveBeenCalledWith('eva_audit_log');
  });

  it('should throw non-retryable error when ventureId or stageId missing', async () => {
    const supabase = createMockSupabase();
    try {
      await handleStageFailed({ ventureId: 'v-1' }, { supabase });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('stageId are required');
      expect(err.retryable).toBe(false);
    }
  });

  it('should escalate gate rejections to chairman review', async () => {
    const supabase = createMockSupabase();
    const result = await handleStageFailed(
      { ventureId: 'v-1', stageId: 's-3', reason: 'Gate score below threshold', failureType: 'gate_rejection' },
      { supabase, ventureId: 'v-1' }
    );

    expect(result.outcome).toBe('failure_logged');
    expect(result.failureType).toBe('gate_rejection');
    expect(supabase.from).toHaveBeenCalledWith('chairman_decisions');
  });
});
