/**
 * Unit tests for LLM Usage Logger
 * SD-LEO-INFRA-LLM-RESPONSE-CACHING-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
// The from() builder must support BOTH the model_usage_log insert path AND the
// FR-3 sd_id fallback read (`from('claude_sessions').select().eq().maybeSingle()`).
// A bare `{ insert }` broke the read chain with "db.from(...).select is not a
// function"; this builder keeps the insert spy and adds a chainable select path.
const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom }))
}));

// Set env vars before importing
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { logUsage, _resetClaimCacheForTest } = await import('./usage-logger.js');

// logUsage is fire-and-forget: the model_usage_log insert runs in microtasks
// after the FR-3 sd_id fallback (claude_sessions read) resolves. Flush the
// microtask/timer queue so the insert has actually been issued before asserting.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('logUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetClaimCacheForTest();
    mockInsert.mockResolvedValue({ error: null });
  });

  it('inserts a row into model_usage_log', async () => {
    logUsage({
      model: 'gemini-2.5-pro',
      provider: 'google',
      purpose: 'classification',
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 1200
    });
    await flush();

    expect(mockFrom).toHaveBeenCalledWith('model_usage_log');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        reported_model_name: 'gemini-2.5-pro',
        reported_model_id: 'gemini-2.5-pro',
        metadata: expect.objectContaining({
          provider: 'google',
          purpose: 'classification',
          input_tokens: 100,
          output_tokens: 50,
          duration_ms: 1200,
          cache_hit: false
        })
      })
    );
  });

  it('includes cache_hit flag when true', async () => {
    logUsage({ model: 'test', provider: 'cache', cacheHit: true });
    await flush();

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ cache_hit: true })
      })
    );
  });

  it('includes sd_id and phase when provided', async () => {
    logUsage({
      model: 'test',
      provider: 'google',
      sdId: 'SD-TEST-001',
      phase: 'EXEC'
    });
    await flush();

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sd_id: 'SD-TEST-001',
        phase: 'EXEC'
      })
    );
  });

  it('defaults to unknown model when not provided', async () => {
    logUsage({});
    await flush();

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        reported_model_name: 'unknown',
        reported_model_id: 'unknown'
      })
    );
  });

  it('does not throw when insert fails', () => {
    mockInsert.mockResolvedValue({ error: { message: 'db error' } });

    expect(() => logUsage({ model: 'test', provider: 'google' })).not.toThrow();
  });

  it('does not throw when insert rejects', () => {
    mockInsert.mockRejectedValue(new Error('network error'));

    expect(() => logUsage({ model: 'test', provider: 'google' })).not.toThrow();
  });
});
