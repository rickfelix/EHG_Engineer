/**
 * Tests for processLifecycleTerminal (stage-execution-engine orchestrator hook).
 * SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 FR-4 (orchestrator side).
 *
 * Covers:
 *  - Skip when dryRun, invalid output, or no lifecycle_terminal hint
 *  - Exit-gates pass → workflow_status='completed' UPDATE attempted
 *  - Exit-gates blocked → no UPDATE; result reports blockedBy
 *  - Idempotent re-run → count=0 path returns {idempotent: true}
 *  - Supabase UPDATE error → non-blocking, returns {completed: false}
 *  - Hook failure (exit-gates throws) → swallowed, returns {completed: false}
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the exit-gate-enforcer BEFORE importing the engine.
const mockCheckExitGates = vi.fn();
vi.mock('../lifecycle/exit-gate-enforcer.js', () => ({
  checkExitGates: (...args) => mockCheckExitGates(...args),
}));

let processLifecycleTerminal;

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import to pick up the mocked checkExitGates
  ({ processLifecycleTerminal } = await import('../stage-execution-engine.js'));
});

const silentLogger = { log: vi.fn(), warn: vi.fn() };

function buildSupabaseStub({ updateResult = { error: null, count: 1 } } = {}) {
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockResolvedValue(updateResult),
  };
  return {
    from: vi.fn().mockReturnValue(updateChain),
    _updateChain: updateChain,
  };
}

describe('processLifecycleTerminal — short-circuits', () => {
  test('returns handled:false when dryRun=true', async () => {
    const result = await processLifecycleTerminal({
      supabase: {}, ventureId: 'v1', stageNumber: 26,
      output: { lifecycle_terminal: 'request' }, validation: { valid: true },
      dryRun: true, logger: silentLogger,
    });
    expect(result).toEqual({ handled: false, completed: false, idempotent: false });
    expect(mockCheckExitGates).not.toHaveBeenCalled();
  });

  test('returns handled:false when validation invalid', async () => {
    const result = await processLifecycleTerminal({
      supabase: {}, ventureId: 'v1', stageNumber: 26,
      output: { lifecycle_terminal: 'request' }, validation: { valid: false },
      dryRun: false, logger: silentLogger,
    });
    expect(result.handled).toBe(false);
    expect(mockCheckExitGates).not.toHaveBeenCalled();
  });

  test('returns handled:false when no lifecycle_terminal hint emitted', async () => {
    const result = await processLifecycleTerminal({
      supabase: {}, ventureId: 'v1', stageNumber: 26,
      output: { growth_experiments: [] }, validation: { valid: true },
      dryRun: false, logger: silentLogger,
    });
    expect(result.handled).toBe(false);
    expect(mockCheckExitGates).not.toHaveBeenCalled();
  });

  test('returns handled:false when output is null', async () => {
    const result = await processLifecycleTerminal({
      supabase: {}, ventureId: 'v1', stageNumber: 26,
      output: null, validation: { valid: true },
      dryRun: false, logger: silentLogger,
    });
    expect(result.handled).toBe(false);
  });
});

describe('processLifecycleTerminal — exit-gates pass', () => {
  test('flips workflow_status=completed and reports completed=true', async () => {
    mockCheckExitGates.mockResolvedValue({ allowed: true, blocked_by: [], gates_checked: ['verifyGrowthPlaybookPresent'] });
    const supabase = buildSupabaseStub({ updateResult: { error: null, count: 1 } });
    const result = await processLifecycleTerminal({
      supabase, ventureId: 'venture-uuid', stageNumber: 26,
      output: { lifecycle_terminal: 'request' }, validation: { valid: true },
      dryRun: false, logger: silentLogger,
    });
    expect(mockCheckExitGates).toHaveBeenCalledWith({ supabase, ventureId: 'venture-uuid', fromStage: 26 });
    expect(supabase.from).toHaveBeenCalledWith('ventures');
    expect(supabase._updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_status: 'completed' }),
      { count: 'exact' },
    );
    expect(supabase._updateChain.eq).toHaveBeenCalledWith('id', 'venture-uuid');
    expect(supabase._updateChain.neq).toHaveBeenCalledWith('workflow_status', 'completed');
    expect(result).toEqual({ handled: true, completed: true, idempotent: false });
  });

  test('idempotent re-run (UPDATE matched 0 rows) returns {idempotent: true, completed: false}', async () => {
    mockCheckExitGates.mockResolvedValue({ allowed: true, blocked_by: [], gates_checked: [] });
    const supabase = buildSupabaseStub({ updateResult: { error: null, count: 0 } });
    const result = await processLifecycleTerminal({
      supabase, ventureId: 'v1', stageNumber: 26,
      output: { lifecycle_terminal: 'request' }, validation: { valid: true },
      dryRun: false, logger: silentLogger,
    });
    expect(result).toEqual({ handled: true, completed: false, idempotent: true });
  });

  test('UPDATE error is non-blocking; returns {completed: false}', async () => {
    mockCheckExitGates.mockResolvedValue({ allowed: true, blocked_by: [], gates_checked: [] });
    const supabase = buildSupabaseStub({ updateResult: { error: { message: 'PGRST permission denied' }, count: null } });
    const warnSpy = vi.fn();
    const result = await processLifecycleTerminal({
      supabase, ventureId: 'v1', stageNumber: 26,
      output: { lifecycle_terminal: 'request' }, validation: { valid: true },
      dryRun: false, logger: { log: vi.fn(), warn: warnSpy },
    });
    expect(result).toEqual({ handled: true, completed: false, idempotent: false });
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('processLifecycleTerminal — exit-gates blocked', () => {
  test('does NOT update ventures and reports blockedBy', async () => {
    mockCheckExitGates.mockResolvedValue({
      allowed: false,
      blocked_by: ['verifyGrowthPlaybookPresent: missing artifact'],
      gates_checked: ['verifyGrowthPlaybookPresent'],
    });
    const supabase = buildSupabaseStub();
    const result = await processLifecycleTerminal({
      supabase, ventureId: 'v1', stageNumber: 26,
      output: { lifecycle_terminal: 'request' }, validation: { valid: true },
      dryRun: false, logger: silentLogger,
    });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.handled).toBe(true);
    expect(result.completed).toBe(false);
    expect(result.blockedBy).toEqual(['verifyGrowthPlaybookPresent: missing artifact']);
  });
});

describe('processLifecycleTerminal — exception swallowing', () => {
  test('checkExitGates throw is non-blocking; returns {completed: false}', async () => {
    mockCheckExitGates.mockRejectedValue(new Error('network'));
    const warnSpy = vi.fn();
    const result = await processLifecycleTerminal({
      supabase: buildSupabaseStub(), ventureId: 'v1', stageNumber: 26,
      output: { lifecycle_terminal: 'request' }, validation: { valid: true },
      dryRun: false, logger: { log: vi.fn(), warn: warnSpy },
    });
    expect(result).toEqual({ handled: true, completed: false, idempotent: false });
    expect(warnSpy).toHaveBeenCalled();
  });
});
