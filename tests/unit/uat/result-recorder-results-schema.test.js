/**
 * QF-20260830-074: lib/uat/result-recorder.js's recordResult() inserted
 * test_run_id/source_type/source_id/scenario_snapshot into uat_test_results -- none of those
 * columns exist (real: run_id/test_case_id/metadata jsonb, per
 * database/migrations/uat-tracking-schema.sql:89). Every insert failed, so no walk could ever
 * write a per-step result (run 8e54bfc7 sat at 0/14 result rows for 45+ minutes).
 *
 * This mocked test asserts on the exact insert payload -- a regression back to a phantom
 * column name fails here, not silently in production. The companion describeDb-gated
 * integration test (result-recorder-results-integration.db.test.js) exercises the REAL table,
 * since a unit mock is exactly what hid this class of defect in the first place.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { row: null };

function makeInsertChain() {
  const chain = {
    select: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: state.row, error: null })),
  };
  chain.insert = vi.fn((...args) => {
    chain.__lastArgs = args;
    return chain;
  });
  return chain;
}

const resultsInsertChain = makeInsertChain();
const runsChain = {
  select: vi.fn(() => runsChain),
  eq: vi.fn(() => runsChain),
  update: vi.fn(() => runsChain),
  single: vi.fn(async () => ({ data: { passed_tests: 0, failed_tests: 0, skipped_tests: 0 }, error: null })),
};

const fromMock = vi.fn((table) => {
  if (table === 'uat_test_results') return resultsInsertChain;
  if (table === 'uat_test_runs') return runsChain;
  throw new Error(`unexpected table: ${table}`);
});

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({ from: fromMock })),
}));

const { recordResult } = await import('../../../lib/uat/result-recorder.js');

describe('recordResult() uat_test_results schema alignment (mocked)', () => {
  beforeEach(() => {
    resultsInsertChain.insert.mockClear();
    state.row = { id: 'result-1' };
  });

  it('inserts only real columns, folding scenario metadata into the jsonb column', async () => {
    await recordResult('run-1', { id: 's1', title: 'Scenario', source: 'user_story', sourceId: 'us-1' }, 'PASS');

    expect(resultsInsertChain.insert).toHaveBeenCalledTimes(1);
    const payload = resultsInsertChain.insert.mock.calls[0][0];

    expect(payload).toHaveProperty('run_id', 'run-1');
    expect(payload).toHaveProperty('status', 'pass');
    for (const phantom of ['test_run_id', 'source_type', 'source_id', 'scenario_snapshot']) {
      expect(payload).not.toHaveProperty(phantom);
    }
    expect(payload.metadata).toMatchObject({
      source_type: 'user_story',
      source_id: 'us-1',
      scenario_snapshot: { id: 's1', title: 'Scenario' },
    });
  });
});
