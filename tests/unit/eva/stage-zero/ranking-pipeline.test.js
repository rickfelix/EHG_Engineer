/**
 * Unit Tests: Ranking Pipeline
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-006)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock all pollers
vi.mock('../../../../lib/eva/stage-zero/data-pollers/apple-rss-poller.js', () => ({
  pollAppleRSS: vi.fn(),
}));
vi.mock('../../../../lib/eva/stage-zero/data-pollers/gplay-scraper.js', () => ({
  pollGooglePlay: vi.fn(),
}));
vi.mock('../../../../lib/eva/stage-zero/data-pollers/producthunt-poller.js', () => ({
  pollProductHunt: vi.fn(),
}));

// Mock discovery mode
vi.mock('../../../../lib/eva/stage-zero/paths/discovery-mode.js', () => ({
  executeDiscoveryMode: vi.fn(),
}));

// Mock interfaces
vi.mock('../../../../lib/eva/stage-zero/interfaces.js', () => ({
  createPathOutput: vi.fn((input) => ({ ...input, _validated: true })),
}));

// Mock LLM client factory
vi.mock('../../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(),
}));

import { runRankingPipeline } from '../../../../lib/eva/stage-zero/ranking-pipeline.js';
import { pollAppleRSS } from '../../../../lib/eva/stage-zero/data-pollers/apple-rss-poller.js';
import { pollGooglePlay } from '../../../../lib/eva/stage-zero/data-pollers/gplay-scraper.js';
import { pollProductHunt } from '../../../../lib/eva/stage-zero/data-pollers/producthunt-poller.js';
import { executeDiscoveryMode } from '../../../../lib/eva/stage-zero/paths/discovery-mode.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };
const mockSupabase = { from: vi.fn() };

describe('runRankingPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('throws when supabase is not provided', async () => {
    await expect(runRankingPipeline({ logger: silentLogger })).rejects.toThrow('supabase client is required');
  });

  test('returns valid output when all pollers succeed', async () => {
    pollAppleRSS.mockResolvedValue({ success: true, count: 100 });
    pollGooglePlay.mockResolvedValue({ success: true, count: 80 });
    pollProductHunt.mockResolvedValue({ success: true, count: 50 });

    const mockOutput = {
      origin_type: 'discovery',
      raw_material: {},
      suggested_name: 'Test',
      suggested_problem: 'Test problem',
      suggested_solution: 'Test solution',
      target_market: 'General',
      metadata: {},
    };
    executeDiscoveryMode.mockResolvedValue(mockOutput);

    const result = await runRankingPipeline({ supabase: mockSupabase, logger: silentLogger });

    expect(result.pollerResults).toHaveLength(3);
    expect(result.pollerResults.filter(r => r.success)).toHaveLength(3);
    expect(result.totalNewRecords).toBe(230);
    expect(result.output).toBeDefined();
  });

  test('handles partial poller failures gracefully', async () => {
    pollAppleRSS.mockResolvedValue({ success: true, count: 50 });
    pollGooglePlay.mockResolvedValue({ success: false, count: 0, error: 'RequestError' });
    pollProductHunt.mockResolvedValue({ success: false, count: 0, error: 'no_token' });

    const mockOutput = { origin_type: 'discovery', metadata: {} };
    executeDiscoveryMode.mockResolvedValue(mockOutput);

    const result = await runRankingPipeline({ supabase: mockSupabase, logger: silentLogger });

    expect(result.pollerResults.filter(r => r.success)).toHaveLength(1);
    expect(result.totalNewRecords).toBe(50);
    expect(result.output).toBeDefined();
  });

  test('still produces output when all pollers fail', async () => {
    pollAppleRSS.mockResolvedValue({ success: false, count: 0, error: 'Network error' });
    pollGooglePlay.mockResolvedValue({ success: false, count: 0, error: 'Not installed' });
    pollProductHunt.mockResolvedValue({ success: false, count: 0, error: 'no_token' });

    const mockOutput = { origin_type: 'discovery', metadata: {} };
    executeDiscoveryMode.mockResolvedValue(mockOutput);

    const result = await runRankingPipeline({ supabase: mockSupabase, logger: silentLogger });

    expect(result.totalNewRecords).toBe(0);
    expect(result.output).toBeDefined();
    expect(result.output.metadata.rankingDataAvailable).toBe(false);
  });

  test('falls back to minimal PathOutput when trend scanner fails', async () => {
    pollAppleRSS.mockResolvedValue({ success: true, count: 10 });
    pollGooglePlay.mockResolvedValue({ success: false, count: 0, error: 'Error' });
    pollProductHunt.mockResolvedValue({ success: false, count: 0, error: 'no_token' });

    executeDiscoveryMode.mockRejectedValue(new Error('LLM unavailable'));

    const result = await runRankingPipeline({ supabase: mockSupabase, logger: silentLogger });

    expect(result.output).toBeDefined();
    expect(result.output.origin_type).toBe('discovery');
  });
});
