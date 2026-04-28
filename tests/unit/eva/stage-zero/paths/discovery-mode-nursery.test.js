/**
 * Unit test for FR-7 conservative nursery gate (TS-11, US-009 boundary case).
 * Confirms 0-input → graceful empty output (NOT undercount error).
 *
 * Part of SD-LEO-ENH-TREND-SCANNER-SCORING-001 Checkpoint 3.
 */

import { describe, test, expect, vi } from 'vitest';

vi.mock('../../../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(() => ({ complete: vi.fn() })),
}));

vi.mock('../../../../../lib/capabilities/scanner-context.js', () => ({
  getCapabilityContextBlock: vi.fn().mockResolvedValue(''),
}));

import {
  executeDiscoveryMode,
  LLMUndercountError,
} from '../../../../../lib/eva/stage-zero/paths/discovery-mode.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function nurserySupabase(items) {
  // discovery_strategies.single() needs to return the strategy config; venture_nursery query uses
  // .from('venture_nursery').select(...).eq('status','parked').order(...).limit(...)
  const calls = [];
  return {
    from: vi.fn((table) => {
      calls.push(table);
      if (table === 'discovery_strategies') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { strategy_key: 'nursery_reeval', name: 'Nursery Re-eval', description: 'reeval', is_active: true },
            error: null,
          }),
        };
      }
      // venture_nursery
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: items, error: null }),
      };
    }),
  };
}

describe('runNurseryReeval — conservative gate (TS-11)', () => {
  test('0 nursery items → returns null (graceful empty), no LLMUndercountError', async () => {
    const result = await executeDiscoveryMode(
      { strategy: 'nursery_reeval', candidateCount: 5 },
      { supabase: nurserySupabase([]), logger: silentLogger, llmClient: { complete: vi.fn() } }
    );
    // executeDiscoveryMode returns null when no candidates returned from runner
    // (existing behavior preserved for the 0-input boundary case).
    expect(result).toBeNull();
  });

  test('LLMUndercountError class instantiation surface (constructor contract)', () => {
    // Defends against accidental constructor signature drift; the queue processor
    // catch block reads err.errorType + err.expected + err.actual.
    const e = new LLMUndercountError({
      strategyName: 'nursery_reeval',
      promptVersion: null,
      expected: 3,
      actual: 0,
    });
    expect(e.errorType).toBe('undercount');
    expect(e.expected).toBe(3);
    expect(e.actual).toBe(0);
    expect(e.strategyName).toBe('nursery_reeval');
  });
});
