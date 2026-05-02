import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeWorktreeState, clearWorktreeState } from './worktree-state-writer.mjs';

function makeSupabaseMock(returnRows = [{ session_id: 'S1' }], error = null) {
  const select = vi.fn().mockResolvedValue({ data: returnRows, error });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, _spies: { from, update, eq, select } };
}

describe('writeWorktreeState', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stdoutSpy.mockClear();
  });

  it('refuses when sessionId is missing', async () => {
    const supabase = makeSupabaseMock();
    const result = await writeWorktreeState(null, 'SD-X', '/p', 'feat/SD-X', { supabase });
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/sessionId/i);
    expect(supabase._spies.update).not.toHaveBeenCalled();
  });

  it('refuses when worktreePath is missing (clearWorktreeState owns clears)', async () => {
    const supabase = makeSupabaseMock();
    const result = await writeWorktreeState('S1', 'SD-X', null, 'feat/SD-X', { supabase });
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/clearWorktreeState/);
  });

  it('issues UPDATE setting only worktree_path and worktree_branch (never sd_key)', async () => {
    const supabase = makeSupabaseMock([{ session_id: 'S1', sd_key: 'SD-X' }]);
    await writeWorktreeState('S1', 'SD-X', '/p', 'feat/SD-X', { supabase });

    expect(supabase._spies.from).toHaveBeenCalledWith('claude_sessions');
    const updateArg = supabase._spies.update.mock.calls[0][0];
    expect(updateArg).toEqual({
      worktree_path: '/p',
      worktree_branch: 'feat/SD-X'
    });
    expect(updateArg).not.toHaveProperty('sd_key');
    expect(supabase._spies.eq).toHaveBeenCalledWith('session_id', 'S1');
  });

  it('emits structured audit log line on success', async () => {
    const supabase = makeSupabaseMock([{ session_id: 'S1' }]);
    await writeWorktreeState('S1', 'SD-X', '/p', 'feat/SD-X', { supabase });

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const line = stdoutSpy.mock.calls[0][0];
    const parsed = JSON.parse(line.trim());
    expect(parsed).toMatchObject({
      event: 'worktree_state_write',
      session_id: 'S1',
      sd_key: 'SD-X',
      op: 'write',
      path: '/p',
      branch: 'feat/SD-X'
    });
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns DB-error reason when update fails', async () => {
    const supabase = makeSupabaseMock(null, { message: 'permission denied' });
    const result = await writeWorktreeState('S1', 'SD-X', '/p', 'feat/SD-X', { supabase });
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/permission denied/);
  });

  it('returns failure when session not found (0 rows)', async () => {
    const supabase = makeSupabaseMock([]);
    const result = await writeWorktreeState('S1', 'SD-X', '/p', 'feat/SD-X', { supabase });
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/not found/);
  });
});

describe('clearWorktreeState', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stdoutSpy.mockClear();
  });

  it('refuses when sessionId is missing', async () => {
    const supabase = makeSupabaseMock();
    const result = await clearWorktreeState(null, { supabase });
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/sessionId/i);
    expect(supabase._spies.update).not.toHaveBeenCalled();
  });

  it('issues UPDATE setting both worktree columns to NULL (never sd_key)', async () => {
    const supabase = makeSupabaseMock([{ session_id: 'S1', sd_key: null }]);
    await clearWorktreeState('S1', { supabase });

    const updateArg = supabase._spies.update.mock.calls[0][0];
    expect(updateArg).toEqual({
      worktree_path: null,
      worktree_branch: null
    });
    expect(updateArg).not.toHaveProperty('sd_key');
  });

  it('returns success even when 0 rows affected (idempotent)', async () => {
    const supabase = makeSupabaseMock([]);
    const result = await clearWorktreeState('S1', { supabase });
    expect(result.success).toBe(true);
    expect(result.reason).toMatch(/0 rows/);
  });

  it('emits audit log with op=clear and includes opts.reason', async () => {
    const supabase = makeSupabaseMock([{ session_id: 'S1' }]);
    await clearWorktreeState('S1', { supabase, reason: 'takeover_prior_session' });

    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0].trim());
    expect(parsed).toMatchObject({
      event: 'worktree_state_write',
      session_id: 'S1',
      op: 'clear',
      path: null,
      branch: null,
      reason: 'takeover_prior_session',
      rows_affected: 1
    });
  });

  it('audit log carries rows_affected=0 when no row matched', async () => {
    const supabase = makeSupabaseMock([]);
    await clearWorktreeState('S1', { supabase });
    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0].trim());
    expect(parsed.rows_affected).toBe(0);
  });

  it('returns DB-error reason when update fails', async () => {
    const supabase = makeSupabaseMock(null, { message: 'connection lost' });
    const result = await clearWorktreeState('S1', { supabase });
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/connection lost/);
  });
});
