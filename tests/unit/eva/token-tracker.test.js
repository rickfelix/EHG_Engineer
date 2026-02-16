/**
 * Token Tracker Unit Tests
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-C
 *
 * Tests: recordTokenUsage, checkBudget, buildTokenSummary
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordTokenUsage, checkBudget, buildTokenSummary, _internal } from '../../../lib/eva/utils/token-tracker.js';

describe('Token Tracker', () => {
  let mockSupabase;
  let mockLogger;

  beforeEach(() => {
    _internal.budgetCache.clear();
    mockLogger = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });

  describe('recordTokenUsage', () => {
    it('should insert a row into venture_token_ledger', async () => {
      recordTokenUsage({
        ventureId: 'v-123',
        stageId: 5,
        usage: { inputTokens: 100, outputTokens: 50 },
        metadata: { agentType: 'claude', modelId: 'opus-4.6' },
      }, { supabase: mockSupabase, logger: mockLogger });

      // Fire-and-forget — give the promise a tick to resolve
      await new Promise(r => setTimeout(r, 10));

      expect(mockSupabase.from).toHaveBeenCalledWith('venture_token_ledger');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          venture_id: 'v-123',
          lifecycle_stage: 5,
          tokens_input: 100,
          tokens_output: 50,
          agent_type: 'claude',
          model_id: 'opus-4.6',
        })
      );
    });

    it('should skip when no supabase client', () => {
      recordTokenUsage({
        ventureId: 'v-123',
        stageId: 1,
        usage: { inputTokens: 10, outputTokens: 5 },
      }, { logger: mockLogger });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No supabase client')
      );
    });

    it('should record zeros when usage is missing', async () => {
      recordTokenUsage({
        ventureId: 'v-123',
        stageId: 1,
        usage: undefined,
      }, { supabase: mockSupabase, logger: mockLogger });

      await new Promise(r => setTimeout(r, 10));

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens_input: 0,
          tokens_output: 0,
        })
      );
    });

    it('should invalidate budget cache for the venture', () => {
      _internal.budgetCache.set('v-123', { data: {}, cachedAt: Date.now() });

      recordTokenUsage({
        ventureId: 'v-123',
        stageId: 1,
        usage: { inputTokens: 10, outputTokens: 5 },
      }, { supabase: mockSupabase, logger: mockLogger });

      expect(_internal.budgetCache.has('v-123')).toBe(false);
    });

    it('should log warning on insert error without throwing', async () => {
      mockSupabase.insert = vi.fn().mockResolvedValue({ error: { message: 'DB error' } });

      recordTokenUsage({
        ventureId: 'v-123',
        stageId: 1,
        usage: { inputTokens: 10, outputTokens: 5 },
      }, { supabase: mockSupabase, logger: mockLogger });

      await new Promise(r => setTimeout(r, 10));

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Insert failed')
      );
    });
  });

  describe('checkBudget', () => {
    it('should return budget data from RPC', async () => {
      const budgetData = {
        budget_limit: 500000,
        tokens_used: 120000,
        usage_percentage: 24,
        is_over_budget: false,
      };
      mockSupabase.rpc = vi.fn().mockResolvedValue({ data: budgetData, error: null });

      const result = await checkBudget('v-123', { supabase: mockSupabase, logger: mockLogger });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'get_venture_token_budget_status',
        { p_venture_id: 'v-123' }
      );
      expect(result).toEqual(budgetData);
    });

    it('should return cached data within TTL', async () => {
      const cached = { budget_limit: 500000, tokens_used: 100 };
      _internal.budgetCache.set('v-123', { data: cached, cachedAt: Date.now() });

      const result = await checkBudget('v-123', { supabase: mockSupabase, logger: mockLogger });

      expect(result).toEqual(cached);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should bypass stale cache', async () => {
      const staleData = { budget_limit: 500000, tokens_used: 100 };
      _internal.budgetCache.set('v-123', {
        data: staleData,
        cachedAt: Date.now() - _internal.BUDGET_CACHE_TTL_MS - 1000,
      });

      const freshData = { budget_limit: 500000, tokens_used: 200 };
      mockSupabase.rpc = vi.fn().mockResolvedValue({ data: freshData, error: null });

      const result = await checkBudget('v-123', { supabase: mockSupabase, logger: mockLogger });

      expect(result).toEqual(freshData);
      expect(mockSupabase.rpc).toHaveBeenCalled();
    });

    it('should return null on RPC error', async () => {
      mockSupabase.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'RPC failed' } });

      const result = await checkBudget('v-123', { supabase: mockSupabase, logger: mockLogger });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('RPC error')
      );
    });

    it('should return null on timeout', async () => {
      mockSupabase.rpc = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: {}, error: null }), 5000))
      );

      const result = await checkBudget('v-123', { supabase: mockSupabase, logger: mockLogger });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Budget check failed')
      );
    }, 10000);

    it('should return null when no supabase client', async () => {
      const result = await checkBudget('v-123', { logger: mockLogger });
      expect(result).toBeNull();
    });

    it('should handle array response from RPC', async () => {
      const budgetData = { budget_limit: 100000, tokens_used: 50000 };
      mockSupabase.rpc = vi.fn().mockResolvedValue({ data: [budgetData], error: null });

      const result = await checkBudget('v-123', { supabase: mockSupabase, logger: mockLogger });
      expect(result).toEqual(budgetData);
    });
  });

  describe('buildTokenSummary', () => {
    it('should sum token usages across steps', () => {
      const usages = [
        { inputTokens: 100, outputTokens: 50 },
        { inputTokens: 200, outputTokens: 100 },
        { inputTokens: 50, outputTokens: 25 },
      ];

      const summary = buildTokenSummary(usages, null);

      expect(summary.input_tokens).toBe(350);
      expect(summary.output_tokens).toBe(175);
      expect(summary.total_tokens).toBe(525);
      expect(summary.cumulative_tokens).toBeNull();
      expect(summary.budget_remaining_pct).toBeNull();
      expect(summary.is_over_budget).toBeNull();
    });

    it('should include budget info when available', () => {
      const usages = [{ inputTokens: 100, outputTokens: 50 }];
      const budgetStatus = {
        tokens_used: 120000,
        usage_percentage: 24,
        is_over_budget: false,
      };

      const summary = buildTokenSummary(usages, budgetStatus);

      expect(summary.cumulative_tokens).toBe(120000);
      expect(summary.budget_remaining_pct).toBe(76);
      expect(summary.is_over_budget).toBe(false);
    });

    it('should handle empty usage array', () => {
      const summary = buildTokenSummary([], null);

      expect(summary.input_tokens).toBe(0);
      expect(summary.output_tokens).toBe(0);
      expect(summary.total_tokens).toBe(0);
    });

    it('should handle null/undefined entries in usage array', () => {
      const usages = [
        { inputTokens: 100, outputTokens: 50 },
        null,
        undefined,
        { outputTokens: 30 },
      ];

      const summary = buildTokenSummary(usages, null);

      expect(summary.input_tokens).toBe(100);
      expect(summary.output_tokens).toBe(80);
    });

    it('should clamp budget_remaining_pct to 0 when over 100%', () => {
      const budgetStatus = {
        tokens_used: 600000,
        usage_percentage: 120,
        is_over_budget: true,
      };

      const summary = buildTokenSummary([], budgetStatus);

      expect(summary.budget_remaining_pct).toBe(0);
      expect(summary.is_over_budget).toBe(true);
    });
  });
});
