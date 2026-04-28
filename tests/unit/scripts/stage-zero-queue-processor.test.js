/**
 * Unit test for FR-7 / FR-4e queue processor extensions:
 *  - catch block maps thrown error class → error_details.error_type
 *  - success path surfaces prompt_version in result + typed column
 *
 * Part of SD-LEO-ENH-TREND-SCANNER-SCORING-001 Checkpoint 3.
 *
 * Tests the specific contract surface — error_type values that downstream
 * dashboards distinguish (parse_failure | empty_response | undercount | timeout | other).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Module references the actual error classes via duck-typing (err.errorType).
import {
  LLMEmptyResponseError,
  LLMParseError,
  LLMUndercountError,
} from '../../../lib/eva/stage-zero/paths/discovery-mode.js';

vi.mock('../../../lib/eva/stage-zero/stage-zero-orchestrator.js', () => ({
  executeStageZero: vi.fn(),
}));

import { executeStageZero } from '../../../lib/eva/stage-zero/stage-zero-orchestrator.js';
import { processRequest } from '../../../scripts/stage-zero-queue-processor.js';

let updateCalls;
let supabase;

function makeSupabase() {
  updateCalls = [];
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn((payload) => {
        updateCalls.push(payload);
        return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }),
    })),
  };
}

const baseRequest = {
  id: 'req-1',
  metadata: { path: 'discovery_mode', strategy: 'trend_scanner' },
  priority: 1,
  prompt: 'test',
};

beforeEach(() => {
  vi.clearAllMocks();
  supabase = makeSupabase();
});

describe('processRequest — error_type mapping (FR-7)', () => {
  test('LLMParseError → error_details.error_type=parse_failure', async () => {
    executeStageZero.mockRejectedValue(new LLMParseError({
      strategyName: 'trend_scanner', promptVersion: 'v', responseLength: 50,
    }));
    await processRequest(supabase, baseRequest);

    const failedUpdate = updateCalls.find(u => u.status === 'failed');
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate.error_details.error_type).toBe('parse_failure');
    expect(failedUpdate.error_details.strategy_name).toBe('trend_scanner');
    expect(failedUpdate.error_details.prompt_version).toBe('v');
  });

  test('LLMEmptyResponseError → error_details.error_type=empty_response', async () => {
    executeStageZero.mockRejectedValue(new LLMEmptyResponseError({
      strategyName: 'trend_scanner', promptVersion: 'v', responseLength: 0,
    }));
    await processRequest(supabase, baseRequest);

    const failedUpdate = updateCalls.find(u => u.status === 'failed');
    expect(failedUpdate.error_details.error_type).toBe('empty_response');
  });

  test('LLMUndercountError → error_details.error_type=undercount + expected/actual', async () => {
    executeStageZero.mockRejectedValue(new LLMUndercountError({
      strategyName: 'trend_scanner', promptVersion: 'v', expected: 5, actual: 1,
    }));
    await processRequest(supabase, baseRequest);

    const failedUpdate = updateCalls.find(u => u.status === 'failed');
    expect(failedUpdate.error_details.error_type).toBe('undercount');
    expect(failedUpdate.error_details.expected).toBe(5);
    expect(failedUpdate.error_details.actual).toBe(1);
  });

  test('TimeoutError-shaped error → error_type=timeout', async () => {
    const err = new Error('Operation timed out after 60s');
    err.name = 'TimeoutError';
    executeStageZero.mockRejectedValue(err);
    await processRequest(supabase, baseRequest);

    const failedUpdate = updateCalls.find(u => u.status === 'failed');
    expect(failedUpdate.error_details.error_type).toBe('timeout');
  });

  test('Unknown / generic error → error_type=other', async () => {
    executeStageZero.mockRejectedValue(new Error('something else broke'));
    await processRequest(supabase, baseRequest);

    const failedUpdate = updateCalls.find(u => u.status === 'failed');
    expect(failedUpdate.error_details.error_type).toBe('other');
  });
});

describe('processRequest — success path (FR-4e)', () => {
  test('surfaces prompt_version on top-level result + writes typed column', async () => {
    executeStageZero.mockResolvedValue({
      decision: 'ready',
      duration_ms: 1234,
      brief: { metadata: { prompt_version: '2026-04-28-v2' } },
    });
    await processRequest(supabase, baseRequest);

    const successUpdate = updateCalls.find(u => u.status === 'completed');
    expect(successUpdate).toBeDefined();
    expect(successUpdate.prompt_version).toBe('2026-04-28-v2');
    expect(successUpdate.result.prompt_version).toBe('2026-04-28-v2');
  });

  test('null prompt_version when brief lacks one (legacy strategies)', async () => {
    executeStageZero.mockResolvedValue({
      decision: 'ready',
      duration_ms: 1234,
      brief: { metadata: {} },
    });
    await processRequest(supabase, baseRequest);

    const successUpdate = updateCalls.find(u => u.status === 'completed');
    expect(successUpdate.prompt_version).toBeNull();
  });
});
