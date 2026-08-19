/**
 * QF-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-5: lib/uat/result-recorder.js's write path
 * referenced columns that do not exist on uat_test_runs (total/passed/failed/skipped/
 * executed_by/commit_sha/build_version/scenario_snapshot/defects_found/
 * quick_fixes_created/quality_gate -- none of these are real columns; the real names are
 * total_tests/passed_tests/failed_tests/skipped_tests/pass_rate, with everything else
 * carried in the existing metadata JSONB column). startSession() threw on every call.
 * completeSession() additionally computed pass_rate but never wrote it -- both UAT
 * enforcement hooks read pass_rate to decide whether an SD has a passing UAT run, so a
 * "completed" session never actually satisfied the gate even after fixing the read side.
 *
 * These tests mock the Supabase client and assert on the ACTUAL query payloads sent to
 * .insert()/.update()/.select() -- not on return values alone -- so a regression back to
 * a phantom column name fails here, not silently in production.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { row: null };

function makeChain(methodName, resolvedValue) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => resolvedValue()),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
  };
  chain[methodName] = vi.fn((...args) => {
    chain.__lastArgs = args;
    return chain;
  });
  return chain;
}

const insertChain = makeChain('insert', () => ({ data: state.row, error: null }));
const updateChain = makeChain('update', () => ({ data: state.row, error: null }));
const selectChain = {
  select: vi.fn(() => selectChain),
  eq: vi.fn(() => selectChain),
  single: vi.fn(async () => ({ data: state.row, error: null })),
};

const fromMock = vi.fn((table) => {
  if (table !== 'uat_test_runs') throw new Error(`unexpected table: ${table}`);
  return {
    insert: insertChain.insert,
    update: updateChain.update,
    select: selectChain.select,
  };
});

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({ from: fromMock })),
}));

const { startSession, completeSession, getSessionStatus } = await import('../../../lib/uat/result-recorder.js');

describe('result-recorder.js uat_test_runs schema alignment', () => {
  beforeEach(() => {
    insertChain.insert.mockClear();
    updateChain.update.mockClear();
    fromMock.mockClear();
  });

  it('startSession() inserts only real columns, carrying the rest in metadata', async () => {
    state.row = { id: 'run-1', sd_id: 'sd-1', status: 'running' };
    await startSession('sd-1', {
      executedBy: 'CLAUDE',
      commitSha: 'abc123',
      buildVersion: '1.0.0',
      scenarioSnapshot: [{ id: 's1' }, { id: 's2' }],
    });

    expect(insertChain.insert).toHaveBeenCalledTimes(1);
    const payload = insertChain.insert.mock.calls[0][0];

    // Real columns only.
    expect(payload).toHaveProperty('sd_id', 'sd-1');
    expect(payload).toHaveProperty('status', 'running');
    expect(payload).toHaveProperty('total_tests', 2);
    expect(payload).toHaveProperty('passed_tests', 0);
    expect(payload).toHaveProperty('failed_tests', 0);
    expect(payload).toHaveProperty('skipped_tests', 0);

    // Phantom columns must never appear at the top level.
    for (const phantom of ['total', 'passed', 'failed', 'skipped', 'executed_by', 'commit_sha', 'build_version', 'scenario_snapshot', 'defects_found', 'quick_fixes_created', 'overall_result']) {
      expect(payload).not.toHaveProperty(phantom);
    }

    // Non-existent scalars carried in metadata instead.
    expect(payload.metadata).toMatchObject({
      executed_by: 'CLAUDE',
      commit_sha: 'abc123',
      build_version: '1.0.0',
      defects_found: 0,
    });
  });

  it('completeSession() writes pass_rate (the critical fix -- was computed but discarded)', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 9, failed_tests: 1, skipped_tests: 0, metadata: {} };
    const result = await completeSession('run-1');

    expect(updateChain.update).toHaveBeenCalledTimes(1);
    const payload = updateChain.update.mock.calls[0][0];

    expect(payload).toHaveProperty('pass_rate', 90);
    expect(payload).toHaveProperty('status', 'completed');
    expect(payload).not.toHaveProperty('quality_gate'); // no real column; must be in metadata
    expect(payload.metadata).toMatchObject({ quality_gate: 'RED' }); // 90% < 93% GRADE.A threshold

    expect(result.passRate).toBe(90);
  });

  it('completeSession() quality gate: RED when pass_rate < 93', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 9, failed_tests: 1, skipped_tests: 0, metadata: {} };
    await completeSession('run-1');
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.metadata.quality_gate).toBe('RED');
  });

  it('completeSession() quality gate: GREEN when 100% pass', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 10, failed_tests: 0, skipped_tests: 0, metadata: {} };
    await completeSession('run-1');
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.pass_rate).toBe(100);
    expect(payload.metadata.quality_gate).toBe('GREEN');
  });

  it('completeSession() quality gate: YELLOW when pass_rate >= 93 but some failures', async () => {
    state.row = { id: 'run-1', total_tests: 100, passed_tests: 95, failed_tests: 5, skipped_tests: 0, metadata: {} };
    await completeSession('run-1');
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.pass_rate).toBe(95);
    expect(payload.metadata.quality_gate).toBe('YELLOW');
  });

  it('getSessionStatus() reads real column names, not phantom ones', async () => {
    state.row = {
      id: 'run-1', sd_id: 'sd-1', status: 'completed',
      total_tests: 10, passed_tests: 8, failed_tests: 2, skipped_tests: 0,
      started_at: '2026-08-19T00:00:00Z',
      metadata: { quality_gate: 'RED', defects_found: 2 },
    };
    const status = await getSessionStatus('run-1');

    expect(status.counts).toEqual({ total: 10, completed: 10, remaining: 0, passed: 8, failed: 2, skipped: 0 });
    expect(status.qualityGate).toBe('RED');
    expect(status.defectsFound).toBe(2);
  });

  it('getSessionStatus() defaults gracefully when metadata is absent', async () => {
    state.row = {
      id: 'run-1', sd_id: 'sd-1', status: 'running',
      total_tests: 0, passed_tests: 0, failed_tests: 0, skipped_tests: 0,
      started_at: '2026-08-19T00:00:00Z',
      metadata: null,
    };
    const status = await getSessionStatus('run-1');
    expect(status.qualityGate).toBe('PENDING');
    expect(status.defectsFound).toBe(0);
  });
});
