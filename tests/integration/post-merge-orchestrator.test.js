import { describe, it, expect, beforeEach } from 'vitest';
import { classifyState, runOrchestrator } from '../../scripts/post-merge-handoff-orchestrator.js';

const SD_KEY = 'SD-FAKE-TEST-001';

function fakeSupabase(sd) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: sd, error: null })
        })
      })
    })
  };
}

function recordingRunner() {
  const calls = [];
  let plan = [];
  const run = (cmd, args) => {
    calls.push({ cmd, args });
    const result = plan.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
    return result;
  };
  return { run, calls, setPlan: (p) => { plan = p; } };
}

const ENV_OK = { CLAUDE_SESSION_ID: '6919121d-test' };

describe('classifyState (TS pure-logic guards)', () => {
  it('treats completed SD as idempotent_skip', () => {
    expect(classifyState({ status: 'completed', current_phase: 'LEAD-FINAL-APPROVAL' }).action).toBe('idempotent_skip');
  });
  it('treats LEAD/draft as warn_skip (TS-003)', () => {
    expect(classifyState({ status: 'draft', current_phase: 'LEAD' })).toEqual({ action: 'warn_skip', reason: 'no_exec_work_to_advance' });
  });
  it('treats EXEC/in_progress as advance (TS-001)', () => {
    expect(classifyState({ status: 'in_progress', current_phase: 'EXEC' }).action).toBe('advance');
  });
  it('treats PLAN_PRD as advance', () => {
    expect(classifyState({ status: 'in_progress', current_phase: 'PLAN_PRD' }).action).toBe('advance');
  });
  it('treats unknown phase as warn_skip', () => {
    expect(classifyState({ status: 'in_progress', current_phase: 'WEIRD' }).action).toBe('warn_skip');
  });
});

describe('runOrchestrator (TS-001..TS-006)', () => {
  let runner;
  beforeEach(() => { runner = recordingRunner(); });

  it('TS-006: missing CLAUDE_SESSION_ID returns exit 2 with clear error', async () => {
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase: fakeSupabase({ status: 'in_progress', current_phase: 'EXEC' }), runner: runner.run, env: {} });
    expect(result.exitCode).toBe(2);
    expect(result.error).toMatch(/CLAUDE_SESSION_ID required/);
    expect(runner.calls).toHaveLength(0);
  });

  it('TS-002: idempotent re-run on completed SD is a no-op', async () => {
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase: fakeSupabase({ status: 'completed', current_phase: 'LEAD-FINAL-APPROVAL' }), runner: runner.run, env: ENV_OK });
    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('idempotent_skip');
    expect(runner.calls).toHaveLength(0);
  });

  it('TS-003: SD in LEAD/draft (buggy state) exits 0 with no_exec_work_to_advance', async () => {
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase: fakeSupabase({ status: 'draft', current_phase: 'LEAD' }), runner: runner.run, env: ENV_OK });
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe('no_exec_work_to_advance');
    expect(runner.calls).toHaveLength(0);
  });

  it('TS-001: happy path invokes 2 sub-agents + 3 handoffs in correct order', async () => {
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase: fakeSupabase({ status: 'in_progress', current_phase: 'EXEC' }), runner: runner.run, env: ENV_OK });
    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('completed');
    expect(runner.calls).toEqual([
      { cmd: 'node', args: ['lib/sub-agent-executor.js', 'TESTING', SD_KEY] },
      { cmd: 'node', args: ['scripts/handoff.js', 'execute', 'EXEC-TO-PLAN', SD_KEY] },
      { cmd: 'node', args: ['lib/sub-agent-executor.js', 'RETRO', SD_KEY] },
      { cmd: 'node', args: ['scripts/handoff.js', 'execute', 'PLAN-TO-LEAD', SD_KEY] },
      { cmd: 'node', args: ['scripts/handoff.js', 'execute', 'LEAD-FINAL-APPROVAL', SD_KEY] }
    ]);
  });

  it('TS-004: sub-agent failure halts before its handoff', async () => {
    runner.setPlan([{ exitCode: 1, stdout: '', stderr: 'agent boom' }]);
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase: fakeSupabase({ status: 'in_progress', current_phase: 'EXEC' }), runner: runner.run, env: ENV_OK });
    expect(result.exitCode).toBe(4);
    expect(result.error).toMatch(/TESTING sub-agent failed before EXEC-TO-PLAN/);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0].args[0]).toBe('lib/sub-agent-executor.js');
  });

  it('TS-005: middle handoff failure preserves prior progress', async () => {
    runner.setPlan([
      { exitCode: 0 }, // TESTING
      { exitCode: 0 }, // EXEC-TO-PLAN ok
      { exitCode: 0 }, // RETRO
      { exitCode: 1, stderr: 'plan-to-lead boom' } // PLAN-TO-LEAD fails
    ]);
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase: fakeSupabase({ status: 'in_progress', current_phase: 'EXEC' }), runner: runner.run, env: ENV_OK });
    expect(result.exitCode).toBe(5);
    expect(result.step).toBe('PLAN-TO-LEAD');
    expect(runner.calls).toHaveLength(4);
  });

  it('returns exit 3 when SD does not exist in DB', async () => {
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase: fakeSupabase(null), runner: runner.run, env: ENV_OK });
    expect(result.exitCode).toBe(3);
    expect(result.error).toMatch(/not found/);
  });
});
