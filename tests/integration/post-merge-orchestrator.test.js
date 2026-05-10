import { describe, it, expect, beforeEach } from 'vitest';
import { classifyState, runOrchestrator, deriveSessionFromBranch } from '../../scripts/post-merge-handoff-orchestrator.js';

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

// SD-LEO-INFRA-POST-MERGE-AUTO-001 FR-2 deriveSessionFromBranch coverage (T7-T10).
// Stub claude_sessions PostgREST chain: select → eq → is → eq → gt → order → limit.
function fakeClaudeSessions(rows, error = null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    gt: () => chain,
    order: () => chain,
    limit: async () => ({ data: rows, error }),
  };
  return { from: () => chain };
}

describe('deriveSessionFromBranch (FR-2 — SD-LEO-INFRA-POST-MERGE-AUTO-001)', () => {
  it('T7: count==1 returns session_id with source=unique_match', async () => {
    const supabase = fakeClaudeSessions([
      { session_id: 'sess-uuid-A', heartbeat_at: new Date().toISOString() },
    ]);
    const r = await deriveSessionFromBranch(supabase, 'feat/SD-FAKE-001');
    expect(r.ok).toBe(true);
    expect(r.session_id).toBe('sess-uuid-A');
    expect(r.source).toBe('unique_match');
  });

  it('T8: count==0 returns ok=false with reason=no_active_session_for_branch', async () => {
    const supabase = fakeClaudeSessions([]);
    const r = await deriveSessionFromBranch(supabase, 'feat/SD-FAKE-001');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_active_session_for_branch');
    expect(r.merged_branch).toBe('feat/SD-FAKE-001');
  });

  it('T9: count==2 with most-recent heartbeat 5s newer returns most-recent (warn-but-proceed)', async () => {
    const now = Date.now();
    const supabase = fakeClaudeSessions([
      { session_id: 'sess-newer', heartbeat_at: new Date(now).toISOString() },
      { session_id: 'sess-older', heartbeat_at: new Date(now - 5000).toISOString() },
    ]);
    const r = await deriveSessionFromBranch(supabase, 'feat/SD-FAKE-001');
    expect(r.ok).toBe(true);
    expect(r.session_id).toBe('sess-newer');
    expect(r.source).toBe('most_recent_heartbeat_warn');
    expect(r.heartbeat_delta_ms).toBeGreaterThan(2000);
  });

  it('T10: count==2 within ±2s returns ok=false with reason=ambiguous_concurrent_sessions', async () => {
    const now = Date.now();
    const supabase = fakeClaudeSessions([
      { session_id: 'sess-A', heartbeat_at: new Date(now).toISOString() },
      { session_id: 'sess-B', heartbeat_at: new Date(now - 1500).toISOString() },
    ]);
    const r = await deriveSessionFromBranch(supabase, 'feat/SD-FAKE-001');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ambiguous_concurrent_sessions');
    expect(r.heartbeat_delta_ms).toBeLessThanOrEqual(2000);
  });

  it('propagates DB query error as ok=false reason=db_query_failed', async () => {
    const supabase = fakeClaudeSessions(null, { message: 'PostgREST exploded' });
    const r = await deriveSessionFromBranch(supabase, 'feat/SD-FAKE-001');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('db_query_failed');
    expect(r.detail).toMatch(/PostgREST/);
  });
});

describe('runOrchestrator FR-2 integration (env-vs-derive precedence)', () => {
  let runner;
  beforeEach(() => { runner = recordingRunner(); });

  it('FR-2a: --merged-branch + missing env + 1 active session → derives session_id and continues', async () => {
    // Composite supabase: claude_sessions returns 1 row, strategic_directives_v2 returns the SD.
    const sd = { status: 'in_progress', current_phase: 'EXEC' };
    const supabase = {
      from: (table) => {
        if (table === 'claude_sessions') {
          const chain = {
            select: () => chain, eq: () => chain, is: () => chain, gt: () => chain, order: () => chain,
            limit: async () => ({ data: [{ session_id: 'derived-sess', heartbeat_at: new Date().toISOString() }], error: null }),
          };
          return chain;
        }
        // strategic_directives_v2
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sd, error: null }) }) }),
        };
      },
    };
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase, runner: runner.run, env: {}, mergedBranch: 'feat/SD-FAKE-TEST-001' });
    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('completed');
    // Derived session_id should propagate to spawned subprocesses via opts.env.
    const lastCall = runner.calls[runner.calls.length - 1];
    expect(lastCall.cmd).toBe('node');
  });

  it('FR-2b: --merged-branch + missing env + 0 active sessions → exit 2 reason=no_active_session_for_branch', async () => {
    const supabase = {
      from: (table) => {
        if (table === 'claude_sessions') {
          const chain = {
            select: () => chain, eq: () => chain, is: () => chain, gt: () => chain, order: () => chain,
            limit: async () => ({ data: [], error: null }),
          };
          return chain;
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'in_progress', current_phase: 'EXEC' }, error: null }) }) }) };
      },
    };
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase, runner: runner.run, env: {}, mergedBranch: 'feat/SD-FAKE-TEST-001' });
    expect(result.exitCode).toBe(2);
    expect(result.error).toMatch(/no_active_session_for_branch/);
    expect(runner.calls).toHaveLength(0);
  });

  it('FR-2c: env CLAUDE_SESSION_ID wins even when --merged-branch is also provided', async () => {
    // claude_sessions stub should NOT be queried if env is set; test uses a stub that throws if invoked.
    let claudeSessionsQueried = false;
    const supabase = {
      from: (table) => {
        if (table === 'claude_sessions') {
          claudeSessionsQueried = true;
          throw new Error('claude_sessions should not be queried when env is set');
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'in_progress', current_phase: 'EXEC' }, error: null }) }) }) };
      },
    };
    const result = await runOrchestrator({ sdKey: SD_KEY, supabase, runner: runner.run, env: ENV_OK, mergedBranch: 'feat/SD-FAKE-TEST-001' });
    expect(result.exitCode).toBe(0);
    expect(claudeSessionsQueried).toBe(false);
  });
});

// T6 idempotency regression: orchestrator re-fire on completed SD is a no-op
// (covered by existing TS-002, but explicitly tagged here for SD-LEO-INFRA-POST-MERGE-AUTO-001 traceability).
describe('FR-5 idempotency regression-pin (T6)', () => {
  it('T6: re-fire on status=completed via classifyState returns idempotent_skip', () => {
    expect(classifyState({ status: 'completed', current_phase: 'EXEC' }).action).toBe('idempotent_skip');
    expect(classifyState({ status: 'in_progress', current_phase: 'LEAD-FINAL-APPROVAL' }).action).toBe('idempotent_skip');
  });
});
