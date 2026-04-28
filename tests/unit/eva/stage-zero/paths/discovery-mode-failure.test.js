/**
 * Unit tests for FR-7 silent-failure hardening: typed error throws + post-condition gate.
 * Covers TS-2, TS-3, TS-10, TS-11 (US-002 + US-003 from Checkpoint 1).
 *
 * Asserts that callLLMForCandidates and runTrendScanner surface previously-silent
 * failures as LLMEmptyResponseError / LLMParseError / LLMUndercountError. Also covers
 * the queue-processor catch-block error_type mapping.
 *
 * Part of SD-LEO-ENH-TREND-SCANNER-SCORING-001.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(() => ({ complete: vi.fn() })),
}));

vi.mock('../../../../../lib/capabilities/scanner-context.js', () => ({
  getCapabilityContextBlock: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../../mental-models/index.js', () => ({
  getMentalModelContextBlock: vi.fn().mockResolvedValue(''),
}), { virtual: true });

import {
  executeDiscoveryMode,
  LLMEmptyResponseError,
  LLMParseError,
  LLMUndercountError,
} from '../../../../../lib/eva/stage-zero/paths/discovery-mode.js';
import { TREND_SCANNER_PROMPT_VERSION } from '../../../../../lib/eva/stage-zero/paths/discovery-mode-versions.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function createSupabase(strategy = { strategy_key: 'trend_scanner', name: 'Trend Scanner', description: 'Find trends', is_active: true }) {
  // Each .from() call returns a fresh chainable; supports .select().eq().eq().single() and ranking-data .gte().order().limit()
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: strategy, error: null }),
    })),
  };
}

function llmReturning(content) {
  return { complete: vi.fn().mockResolvedValue(content) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('callLLMForCandidates strict mode (FR-7)', () => {
  test('empty response throws LLMEmptyResponseError with diagnostic context (TS-10)', async () => {
    const llmClient = llmReturning('');
    await expect(
      executeDiscoveryMode(
        { strategy: 'trend_scanner', candidateCount: 5 },
        { supabase: createSupabase(), logger: silentLogger, llmClient }
      )
    ).rejects.toBeInstanceOf(LLMEmptyResponseError);
  });

  test('LLMEmptyResponseError carries strategyName + promptVersion + responseLength', async () => {
    const llmClient = llmReturning('');
    try {
      await executeDiscoveryMode(
        { strategy: 'trend_scanner', candidateCount: 5 },
        { supabase: createSupabase(), logger: silentLogger, llmClient }
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMEmptyResponseError);
      expect(err.strategyName).toBe('trend_scanner');
      expect(err.promptVersion).toBe(TREND_SCANNER_PROMPT_VERSION);
      expect(err.responseLength).toBe(0);
      expect(err.errorType).toBe('empty_response');
    }
  });

  test('malformed JSON (no array) throws LLMParseError (TS-2)', async () => {
    const llmClient = llmReturning('the model says: nothing useful here, no JSON');
    try {
      await executeDiscoveryMode(
        { strategy: 'trend_scanner', candidateCount: 5 },
        { supabase: createSupabase(), logger: silentLogger, llmClient }
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMParseError);
      expect(err.errorType).toBe('parse_failure');
      expect(err.message).toMatch(/parse_failed.*no JSON array found/);
    }
  });

  test('truncated JSON (broken array) throws LLMParseError', async () => {
    const llmClient = llmReturning('[ { "name": "X", broken syntax');
    await expect(
      executeDiscoveryMode(
        { strategy: 'trend_scanner', candidateCount: 5 },
        { supabase: createSupabase(), logger: silentLogger, llmClient }
      )
    ).rejects.toBeInstanceOf(LLMParseError);
  });
});

describe('runTrendScanner post-condition gate (FR-7, TS-3)', () => {
  test('1-of-5 undercount throws LLMUndercountError', async () => {
    const llmClient = llmReturning(JSON.stringify([
      { name: 'OnlyOne', automation_feasibility: 8, competition_level: 'low' },
    ]));
    try {
      await executeDiscoveryMode(
        { strategy: 'trend_scanner', candidateCount: 5 },
        { supabase: createSupabase(), logger: silentLogger, llmClient }
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMUndercountError);
      expect(err.errorType).toBe('undercount');
      expect(err.expected).toBe(5);
      expect(err.actual).toBe(1);
      expect(err.message).toMatch(/got 1 of 5/);
    }
  });

  test('exactly half — does NOT throw (boundary: ceil(5/2)=3 candidates is the floor)', async () => {
    const llmClient = llmReturning(JSON.stringify([
      { name: 'A', automation_feasibility: 8, competition_level: 'low' },
      { name: 'B', automation_feasibility: 7, competition_level: 'medium' },
      { name: 'C', automation_feasibility: 6, competition_level: 'low' },
    ]));
    const result = await executeDiscoveryMode(
      { strategy: 'trend_scanner', candidateCount: 5 },
      { supabase: createSupabase(), logger: silentLogger, llmClient }
    );
    expect(result).not.toBeNull();
    expect(result.raw_material.candidates.length).toBe(3);
  });

  test('full count — emits prompt_version on every candidate', async () => {
    const llmClient = llmReturning(JSON.stringify([
      { name: 'A', automation_feasibility: 8, competition_level: 'low' },
      { name: 'B', automation_feasibility: 7, competition_level: 'medium' },
      { name: 'C', automation_feasibility: 6, competition_level: 'high' },
      { name: 'D', automation_feasibility: 5, competition_level: 'low' },
      { name: 'E', automation_feasibility: 9, competition_level: 'low' },
    ]));
    const result = await executeDiscoveryMode(
      { strategy: 'trend_scanner', candidateCount: 5 },
      { supabase: createSupabase(), logger: silentLogger, llmClient }
    );
    expect(result.raw_material.candidates.length).toBe(5);
    for (const c of result.raw_material.candidates) {
      expect(c.prompt_version).toBe(TREND_SCANNER_PROMPT_VERSION);
    }
  });
});

describe('error_type queue-processor mapping shape (FR-7)', () => {
  // The queue processor catch block reads err.errorType to populate
  // error_details.error_type. This test verifies the contract surface.
  test('LLMEmptyResponseError exposes errorType=empty_response', () => {
    const e = new LLMEmptyResponseError({ strategyName: 'trend_scanner', promptVersion: 'v', responseLength: 0 });
    expect(e.errorType).toBe('empty_response');
    expect(e.name).toBe('LLMEmptyResponseError');
  });

  test('LLMParseError exposes errorType=parse_failure', () => {
    const e = new LLMParseError({ strategyName: 'trend_scanner', promptVersion: 'v', responseLength: 100 });
    expect(e.errorType).toBe('parse_failure');
    expect(e.name).toBe('LLMParseError');
  });

  test('LLMUndercountError exposes errorType=undercount', () => {
    const e = new LLMUndercountError({ strategyName: 'trend_scanner', promptVersion: 'v', expected: 5, actual: 1 });
    expect(e.errorType).toBe('undercount');
    expect(e.name).toBe('LLMUndercountError');
  });
});
