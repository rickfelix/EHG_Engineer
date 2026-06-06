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
import {
  processRequest,
  releaseStaleClaims,
  checkForDuplicate,
  findVentureForRequest,
  mapRequestToParams,
} from '../../../scripts/stage-zero-queue-processor.js';

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

// ════════════════════════════════════════════════════════════════════════
// SD-LEO-FIX-FIX-STAGE-QUEUE-001 — duplicate-venture runaway fix
// ════════════════════════════════════════════════════════════════════════

/**
 * Programmable supabase stub. Distinguishes the queries the fix issues:
 *  - ventures + .maybeSingle()  → findVentureForRequest back-reference lookup
 *  - stage_zero_requests + .in() (then awaited) → releaseStaleClaims stale fetch
 *  - stage_zero_requests + .limit() (then awaited) → discovery dedup list
 *  - .update(...).eq(...)       → status writes (captured in updateCalls)
 */
function makeSupabaseV2({ ventures = [], staleRows = [], completed = [] } = {}) {
  const updateCalls = [];
  function makeBuilder(table) {
    const ctx = { table, eqs: {}, usedIn: false, isUpdate: false };
    const resolveList = () => {
      if (ctx.isUpdate) return { data: null, error: null };
      if (table === 'stage_zero_requests') {
        return ctx.usedIn ? { data: staleRows, error: null } : { data: completed, error: null };
      }
      return { data: [], error: null };
    };
    const b = {
      select: () => b,
      eq: (col, val) => { ctx.eqs[col] = val; return b; },
      neq: () => b,
      gt: () => b,
      lt: () => b,
      in: () => { ctx.usedIn = true; return b; },
      order: () => b,
      limit: () => b,
      update: (payload) => { ctx.isUpdate = true; updateCalls.push({ table, payload, eqs: ctx.eqs }); return b; },
      maybeSingle: async () => {
        if (table === 'ventures') {
          const reqId = ctx.eqs['metadata->stage_zero->>stage_zero_request_id'];
          const v = ventures.find((x) => x.requestId === reqId);
          return { data: v ? { id: v.id } : null, error: null };
        }
        return { data: null, error: null };
      },
      then: (onF, onR) => Promise.resolve(resolveList()).then(onF, onR),
    };
    return b;
  }
  return { from: vi.fn((t) => makeBuilder(t)), updateCalls };
}

describe('FR-6 — mapRequestToParams candidateCount casing (TS-5)', () => {
  test('honors camelCase metadata.candidateCount', () => {
    const params = mapRequestToParams({ metadata: { path: 'discovery_mode', candidateCount: 8 } });
    expect(params.pathParams.candidateCount).toBe(8);
  });
  test('still honors snake_case metadata.candidate_count', () => {
    const params = mapRequestToParams({ metadata: { path: 'discovery_mode', candidate_count: 7 } });
    expect(params.pathParams.candidateCount).toBe(7);
  });
  test('falls back to default 5 when neither casing present', () => {
    const params = mapRequestToParams({ metadata: { path: 'discovery_mode' } });
    expect(params.pathParams.candidateCount).toBe(5);
  });
});

describe('FR-1/FR-2 — request→venture idempotency guard', () => {
  test('findVentureForRequest resolves via the durable metadata back-reference when venture_id is NULL', async () => {
    const supabase = makeSupabaseV2({ ventures: [{ id: 'v-1', requestId: 'req-stale' }] });
    const venture = await findVentureForRequest(supabase, { id: 'req-stale', venture_id: null });
    expect(venture).toEqual({ id: 'v-1', source: 'venture.metadata.stage_zero_request_id' });
  });

  test('processRequest does NOT re-synthesize when the request already produced a venture (TS-1 core)', async () => {
    const supabase = makeSupabaseV2({ ventures: [{ id: 'v-9', requestId: 'req-x' }] });
    const request = { id: 'req-x', venture_id: null, requested_by: 'u1', metadata: { path: 'discovery_mode', strategy: 'trend_scanner' } };

    await processRequest(supabase, request);

    expect(executeStageZero).not.toHaveBeenCalled();
    const completedUpdate = supabase.updateCalls.find((u) => u.payload.status === 'completed');
    expect(completedUpdate).toBeDefined();
    expect(completedUpdate.payload.venture_id).toBe('v-9');
  });
});

describe('FR-3/FR-4 — venture-aware releaseStaleClaims', () => {
  test('TS-1: a stale row whose venture already exists is COMPLETED (never re-pended)', async () => {
    const supabase = makeSupabaseV2({
      ventures: [{ id: 'v-1', requestId: 'req-stale' }],
      staleRows: [{ id: 'req-stale', venture_id: null, processing_attempts: 0, metadata: { path: 'discovery_mode' } }],
    });

    const repended = await releaseStaleClaims(supabase);

    expect(repended).toBe(0); // nothing re-pended
    const upd = supabase.updateCalls.find((u) => u.eqs.id === 'req-stale');
    expect(upd.payload.status).toBe('completed');
    expect(upd.payload.venture_id).toBe('v-1');
    // CRITICAL: the duplicate-generation bug was re-pending a venture-bearing row.
    expect(supabase.updateCalls.some((u) => u.payload.status === 'pending')).toBe(false);
  });

  test('FR-4: a venture-less stale row under the cap is re-pended with processing_attempts incremented', async () => {
    const supabase = makeSupabaseV2({
      ventures: [],
      staleRows: [{ id: 'req-retry', venture_id: null, processing_attempts: 0, metadata: {} }],
    });

    const repended = await releaseStaleClaims(supabase);

    expect(repended).toBe(1);
    const upd = supabase.updateCalls.find((u) => u.eqs.id === 'req-retry');
    expect(upd.payload.status).toBe('pending');
    expect(upd.payload.processing_attempts).toBe(1);
  });

  test('TS-2: a venture-less stale row AT the attempt cap is failed-terminal (no infinite loop)', async () => {
    // Default STAGE_ZERO_MAX_ATTEMPTS = 3; processing_attempts 2 -> 3 -> failed.
    const supabase = makeSupabaseV2({
      ventures: [],
      staleRows: [{ id: 'req-fail', venture_id: null, processing_attempts: 2, metadata: {} }],
    });

    const repended = await releaseStaleClaims(supabase);

    expect(repended).toBe(0);
    const upd = supabase.updateCalls.find((u) => u.eqs.id === 'req-fail');
    expect(upd.payload.status).toBe('failed');
    expect(upd.payload.processing_attempts).toBe(3);
    expect(upd.payload.error_details.error_type).toBe('attempt_cap_exceeded');
  });
});

describe('FR-5 — conservative discovery_mode dedup (TS-3)', () => {
  const reqBase = { id: 'req-new', requested_by: 'u1', metadata: { path: 'discovery_mode', strategy: 'trend_scanner', candidateCount: 5, constraints: {} } };

  test('identical recent same-user request is a dedup hit', async () => {
    const supabase = makeSupabaseV2({
      completed: [{ id: 'req-old', result: { ok: true }, metadata: { path: 'discovery_mode', strategy: 'trend_scanner', candidateCount: 5, constraints: {} } }],
    });
    const dup = await checkForDuplicate(supabase, reqBase);
    expect(dup).not.toBeNull();
    expect(dup.id).toBe('req-old');
  });

  test('different params (distinct discovery) is NOT collapsed', async () => {
    const supabase = makeSupabaseV2({
      completed: [{ id: 'req-other', result: { ok: true }, metadata: { path: 'discovery_mode', strategy: 'competitor_gap', candidateCount: 5, constraints: {} } }],
    });
    const dup = await checkForDuplicate(supabase, reqBase);
    expect(dup).toBeNull();
  });

  test('no recent completed request (outside window → DB returns none) → no dedup', async () => {
    const supabase = makeSupabaseV2({ completed: [] });
    const dup = await checkForDuplicate(supabase, reqBase);
    expect(dup).toBeNull();
  });
});
