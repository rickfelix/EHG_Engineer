/**
 * SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-C FR-1 — processLifecycleTerminal building->operations transition.
 *
 * The staged venture pipeline is finite and ends at the terminal stage (S26). On a successful
 * terminal completion the venture must enter the persistent Operations mode by writing
 * ventures.pipeline_mode='operations'. Pre-fix, processLifecycleTerminal set only
 * workflow_status='completed' and never touched pipeline_mode, so ventures stayed in 'building'
 * forever (the lifecycle docs claimed the transition was automatic, but no code performed it).
 *
 * These tests assert the transition is: performed on terminal success, idempotent, guarded so a
 * venture already in a later pipeline_mode is never demoted (no-clobber via the building/null
 * filter), and non-blocking on failure (mirrors the existing workflow_status semantics).
 *
 * @module tests/unit/eva/stage-execution-engine-lifecycle-terminal.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/lifecycle/exit-gate-enforcer.js', () => ({
  checkExitGates: vi.fn(),
}));

import { processLifecycleTerminal } from '../../../lib/eva/stage-execution-engine.js';
import { checkExitGates } from '../../../lib/eva/lifecycle/exit-gate-enforcer.js';

// Mock supabase that records the two distinct ventures UPDATE chains:
//   workflow_status: .update({workflow_status,..}).eq('id',x).neq('workflow_status','completed') -> {error,count}
//   pipeline_mode:   .update({pipeline_mode}).eq('id',x).or('<guard>')                            -> {error}
function createMockSupabase({ wfCount = 1, wfError = null, modeError = null } = {}) {
  const calls = { wfPatch: null, modePatch: null, modeOrFilter: null, modeUpdateCount: 0 };
  return {
    _calls: calls,
    from: vi.fn(() => ({
      update: vi.fn((patch) => {
        const isMode = Object.prototype.hasOwnProperty.call(patch, 'pipeline_mode');
        if (isMode) { calls.modePatch = patch; calls.modeUpdateCount += 1; }
        else { calls.wfPatch = patch; }
        const chain = {
          eq: vi.fn(() => chain),
          neq: vi.fn(() => Promise.resolve({ error: wfError, count: wfCount })),
          or: vi.fn((filter) => { calls.modeOrFilter = filter; return Promise.resolve({ error: modeError }); }),
        };
        return chain;
      }),
    })),
  };
}

const mockLogger = () => ({ log: vi.fn(), warn: vi.fn() });
const terminalArgs = (supabase, logger) => ({
  supabase, ventureId: 'venture-uuid-1', stageNumber: 26,
  output: { lifecycle_terminal: 'request' }, validation: { valid: true },
  dryRun: false, logger,
});

describe('FR-1: processLifecycleTerminal building->operations transition', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets pipeline_mode=operations (guarded building/null) on a successful S26 terminal completion', async () => {
    checkExitGates.mockResolvedValue({ allowed: true });
    const supabase = createMockSupabase({ wfCount: 1 });
    const logger = mockLogger();

    const result = await processLifecycleTerminal(terminalArgs(supabase, logger));

    expect(result).toEqual({ handled: true, completed: true, idempotent: false });
    expect(supabase._calls.wfPatch).toMatchObject({ workflow_status: 'completed' });
    expect(supabase._calls.modePatch).toEqual({ pipeline_mode: 'operations' });
    // No-clobber: the transition only targets ventures still in building (or null), never a later mode.
    expect(supabase._calls.modeOrFilter).toBe('pipeline_mode.eq.building,pipeline_mode.is.null');
  });

  it('is idempotent: an already-completed venture (count=0) does NOT run the pipeline_mode transition', async () => {
    checkExitGates.mockResolvedValue({ allowed: true });
    const supabase = createMockSupabase({ wfCount: 0 });
    const logger = mockLogger();

    const result = await processLifecycleTerminal(terminalArgs(supabase, logger));

    expect(result).toEqual({ handled: true, completed: false, idempotent: true });
    expect(supabase._calls.modeUpdateCount).toBe(0);
    expect(supabase._calls.modePatch).toBeNull();
  });

  it('is non-blocking: a pipeline_mode UPDATE error does NOT fail the completed terminal', async () => {
    checkExitGates.mockResolvedValue({ allowed: true });
    const supabase = createMockSupabase({ wfCount: 1, modeError: { message: 'transient' } });
    const logger = mockLogger();

    const result = await processLifecycleTerminal(terminalArgs(supabase, logger));

    // workflow_status completion still stands; the mode failure is warned, not thrown.
    expect(result).toEqual({ handled: true, completed: true, idempotent: false });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('pipeline_mode'));
  });

  it('does not transition when exit-gates block the terminal', async () => {
    checkExitGates.mockResolvedValue({ allowed: false, blocked_by: ['gate-x'] });
    const supabase = createMockSupabase({ wfCount: 1 });
    const logger = mockLogger();

    const result = await processLifecycleTerminal(terminalArgs(supabase, logger));

    expect(result).toMatchObject({ handled: true, completed: false, blockedBy: ['gate-x'] });
    expect(supabase._calls.modeUpdateCount).toBe(0);
    expect(supabase._calls.wfPatch).toBeNull();
  });

  it('no-ops on non-terminal / dryRun / invalid input (guard clause)', async () => {
    const supabase = createMockSupabase();
    const logger = mockLogger();
    const r1 = await processLifecycleTerminal({ ...terminalArgs(supabase, logger), output: { lifecycle_terminal: 'none' } });
    const r2 = await processLifecycleTerminal({ ...terminalArgs(supabase, logger), dryRun: true });
    const r3 = await processLifecycleTerminal({ ...terminalArgs(supabase, logger), validation: { valid: false } });
    for (const r of [r1, r2, r3]) expect(r).toEqual({ handled: false, completed: false, idempotent: false });
    expect(checkExitGates).not.toHaveBeenCalled();
  });
});
