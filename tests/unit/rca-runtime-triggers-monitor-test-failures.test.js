/**
 * SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001 — monitorTestFailures() regression coverage.
 *
 * Prior state: zero coverage existed for the real exported monitorTestFailures. The pre-existing
 * tests/unit/rca-runtime-triggers.test.js declares its own local copies of the helper logic and
 * never imports the real module (same trap tests/unit/rca-trigger-failsoft.test.js's own header
 * comment documents for triggerRCA). This file closes that gap using the real function.
 *
 * Test seam: no handler is extracted (deliberately -- see TR-4 in the PRD). The handler is
 * captured off a mocked .channel().on() call, per the in-repo precedent at
 * tests/unit/eva/venture-monitor.test.js (mockChannel.on.mock.calls[0][2]). This proves the
 * subscription is actually wired to the right table/filter, not just that isolated logic works.
 *
 * What is genuinely unit-testable vs. not: Postgres performs the actual ORDER BY / server-side
 * filtering; a unit test can only pin the QUERY PARAMS issued (the .eq/.neq/.order calls) and the
 * CODE'S HANDLING of an already-filtered/sorted result set. Live-DB facts (publication membership,
 * RLS posture, actual tie-break behavior) were independently verified against the real database
 * during this SD's LEAD/PLAN phases and are not re-asserted here.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createSupabaseChainMock } from '../helpers/supabase-chain-mock.js';

const createSupabaseClient = vi.fn();
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseClient: () => createSupabaseClient(),
  createSupabaseServiceClient: () => createSupabaseClient(),
}));
vi.mock('../../lib/sub-agents/rca.js', () => ({ execute: vi.fn(async () => ({ ok: true })) }));

const { monitorTestFailures } = await import('../../lib/rca-runtime-triggers.js');

/**
 * @param {object} opts
 * @param {{data:any[],error:any}} [opts.testResultsResult] - resolution for the test_results lookback query
 * @param {{data:any[],error:any}} [opts.testRunsResult] - resolution for the test_runs ordering query
 */
function createMockSupabase({ testResultsResult, testRunsResult } = {}) {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb) => { if (cb) cb('SUBSCRIBED'); return mockChannel; }),
  };

  const testResultsChain = createSupabaseChainMock({ result: testResultsResult ?? { data: [], error: null } });
  const testRunsChain = createSupabaseChainMock({ result: testRunsResult ?? { data: [], error: null } });

  const rcrChain = createSupabaseChainMock();
  rcrChain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null })); // dedup: no existing OPEN/IN_REVIEW RCR
  rcrChain.single = vi.fn(() => Promise.resolve({ data: { id: 'rcr-test-id' }, error: null })); // create result

  const supabase = {
    channel: vi.fn(() => mockChannel),
    from: vi.fn((table) => {
      if (table === 'test_results') return testResultsChain;
      if (table === 'test_runs') return testRunsChain;
      if (table === 'root_cause_reports') return rcrChain;
      throw new Error(`unexpected table in mock: ${table}`);
    }),
    _mockChannel: mockChannel,
    _testResultsChain: testResultsChain,
    _testRunsChain: testRunsChain,
    _rcrChain: rcrChain,
  };
  return supabase;
}

async function captureHandler(mockSupabase) {
  createSupabaseClient.mockReturnValue(mockSupabase);
  await monitorTestFailures();
  return mockSupabase._mockChannel.on.mock.calls[0][2];
}

const FAILING_ROW = {
  id: 'tr-fail-1',
  test_run_id: 'run-current',
  test_full_title: 'suite > does the thing',
  error_message: 'expected true to be false',
  error_stack: 'Error: expected true to be false\n  at Object.<anonymous>',
  failure_screenshot_path: '/screenshots/tr-fail-1.png',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('monitorTestFailures()', () => {
  test('TS-7: subscribes to test_results INSERT (status=eq.failed), not the retired test_failures table', async () => {
    const mockSupabase = createMockSupabase();
    createSupabaseClient.mockReturnValue(mockSupabase);

    await monitorTestFailures();

    expect(mockSupabase.channel).not.toHaveBeenCalledWith('test_failures');
    const config = mockSupabase._mockChannel.on.mock.calls[0][1];
    expect(config).toEqual({
      event: 'INSERT',
      schema: 'public',
      table: 'test_results',
      filter: 'status=eq.failed',
    });
  });

  test('TS-1: prior run passed, current run fails -> triggers an RCR with trigger_tier=2', async () => {
    const mockSupabase = createMockSupabase({
      testResultsResult: { data: [{ status: 'passed', test_run_id: 'run-prior' }], error: null },
      testRunsResult: { data: [{ id: 'run-prior', started_at: '2026-08-01T00:00:00Z', sd_id: 'SD-EXAMPLE-001' }], error: null },
    });
    const handler = await captureHandler(mockSupabase);

    await handler({ new: FAILING_ROW });

    expect(mockSupabase._rcrChain.insert).toHaveBeenCalledTimes(1);
    const payload = mockSupabase._rcrChain.insert.mock.calls[0][0];
    expect(payload.trigger_tier).toBe(2);
    expect(payload.trigger_source).toBe('TEST_FAILURE');
    expect(payload.sd_id).toBe('SD-EXAMPLE-001');
    expect(payload.failure_signature).toBe('test_regression:suite > does the thing:SD-EXAMPLE-001');
    expect(payload.evidence_refs.stack_trace).toBe(FAILING_ROW.error_stack);
    expect(payload.evidence_refs.screenshot_url).toBe(FAILING_ROW.failure_screenshot_path);
  });

  test('TS-2: no prior row for this test identity -> does not trigger', async () => {
    const mockSupabase = createMockSupabase({
      testResultsResult: { data: [], error: null },
    });
    const handler = await captureHandler(mockSupabase);

    await handler({ new: FAILING_ROW });

    expect(mockSupabase._rcrChain.insert).not.toHaveBeenCalled();
    expect(mockSupabase.from).not.toHaveBeenCalledWith('root_cause_reports');
  });

  test('TS-3: most recent prior run also failed -> does not trigger (not a regression, still broken)', async () => {
    const mockSupabase = createMockSupabase({
      testResultsResult: { data: [{ status: 'failed', test_run_id: 'run-prior' }], error: null },
      testRunsResult: { data: [{ id: 'run-prior', started_at: '2026-08-01T00:00:00Z', sd_id: null }], error: null },
    });
    const handler = await captureHandler(mockSupabase);

    await handler({ new: FAILING_ROW });

    expect(mockSupabase._rcrChain.insert).not.toHaveBeenCalled();
  });

  test('TS-4: NULL test_full_title -> logs a warning and issues no query at all', async () => {
    const mockSupabase = createMockSupabase();
    const handler = await captureHandler(mockSupabase);

    await handler({ new: { ...FAILING_ROW, test_full_title: null } });

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.warn.mock.calls.flat().join(' ')).toMatch(/test_full_title/);
  });

  test('TS-5: orders candidate prior runs by (started_at DESC, id DESC) for deterministic tie-breaking', async () => {
    const mockSupabase = createMockSupabase({
      testResultsResult: { data: [{ status: 'passed', test_run_id: 'run-a' }], error: null },
      testRunsResult: { data: [{ id: 'run-a', started_at: '2026-08-01T00:00:00Z', sd_id: null }], error: null },
    });
    const handler = await captureHandler(mockSupabase);

    await handler({ new: FAILING_ROW });

    const orderCalls = mockSupabase._testRunsChain.order.mock.calls;
    expect(orderCalls[0]).toEqual(['started_at', { ascending: false }]);
    expect(orderCalls[1]).toEqual(['id', { ascending: false }]);
  });

  test('TS-6: excludes the current test_run_id from the lookback (same-run retries never qualify)', async () => {
    const mockSupabase = createMockSupabase({
      testResultsResult: { data: [{ status: 'passed', test_run_id: 'run-earlier' }], error: null },
      testRunsResult: { data: [{ id: 'run-earlier', started_at: '2026-08-01T00:00:00Z', sd_id: null }], error: null },
    });
    const handler = await captureHandler(mockSupabase);

    await handler({ new: FAILING_ROW });

    expect(mockSupabase._testResultsChain.neq).toHaveBeenCalledWith('test_run_id', FAILING_ROW.test_run_id);
    expect(mockSupabase._testResultsChain.eq).toHaveBeenCalledWith('test_full_title', FAILING_ROW.test_full_title);
  });

  test('no prior test_runs resolve for the candidate run ids -> does not trigger (defensive, sparse-run tolerance)', async () => {
    const mockSupabase = createMockSupabase({
      testResultsResult: { data: [{ status: 'passed', test_run_id: 'run-orphaned' }], error: null },
      testRunsResult: { data: [], error: null },
    });
    const handler = await captureHandler(mockSupabase);

    await handler({ new: FAILING_ROW });

    expect(mockSupabase._rcrChain.insert).not.toHaveBeenCalled();
  });
});
