/**
 * SD-LEO-INFRA-FLEET-VIEW-BADGES-001 (FR-3): lib/fleet/attention-flag-writer.js
 *
 * Mirrors lib/coordinator/safe-metadata-merge.mjs's test style: a fake raw-pg client,
 * one atomic `||` merge query, no follow-up read. Zero-notification-call is the
 * property this whole module exists to guarantee (grep-provable + spy-provable).
 */
import { describe, it, expect, vi } from 'vitest';
import { setSessionAttention, clearSessionAttention, getAttentionFlaggedSessions } from '../../../lib/fleet/attention-flag-writer.js';

function fakeClient({ rowCount = 1, queryError = null } = {}) {
  const queries = [];
  return {
    queries,
    query: vi.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (queryError) throw queryError;
      return { rowCount };
    }),
    end: vi.fn(async () => {}),
  };
}

describe('setSessionAttention', () => {
  it('throws synchronously on a missing sessionId or reason (programmer error)', async () => {
    await expect(setSessionAttention()).rejects.toThrow('sessionId is required');
    await expect(setSessionAttention('sess-1')).rejects.toThrow('reason is required');
  });

  it('issues ONE atomic || merge against claude_sessions, never a notification call', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const notifySpy = vi.fn();

    const result = await setSessionAttention('sess-1', { reason: 'awaiting input' }, { createClientFn });

    expect(result).toEqual({ flagged: true, sessionId: 'sess-1' });
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0].sql).toMatch(/UPDATE claude_sessions/i);
    expect(client.queries[0].sql).toMatch(/\|\|/);
    expect(client.queries[0].params[0]).toBe('sess-1');
    const patch = JSON.parse(client.queries[0].params[1]);
    expect(patch.attention).toBe(true);
    expect(patch.attention_reason).toBe('awaiting input');
    expect(client.end).toHaveBeenCalledOnce();
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('reports flagged:false (no throw) when no row matched', async () => {
    const client = fakeClient({ rowCount: 0 });
    const createClientFn = vi.fn(async () => client);
    const result = await setSessionAttention('sess-nope', { reason: 'x' }, { createClientFn });
    expect(result).toEqual({ flagged: false, sessionId: 'sess-nope' });
  });

  it('fail-soft on connection/query failure', async () => {
    const createClientFn = vi.fn(async () => { throw new Error('connect refused'); });
    const result = await setSessionAttention('sess-1', { reason: 'x' }, { createClientFn });
    expect(result.flagged).toBe(false);
    expect(result.error).toMatch(/db_connect_failed/);
  });
});

describe('clearSessionAttention', () => {
  it('throws synchronously on a missing sessionId or clearedBy', async () => {
    await expect(clearSessionAttention()).rejects.toThrow('sessionId is required');
    await expect(clearSessionAttention('sess-1')).rejects.toThrow('clearedBy is required');
  });

  it('issues ONE atomic || merge clearing attention, never a notification call', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const result = await clearSessionAttention('sess-1', { clearedBy: 'Golf-3' }, { createClientFn });
    expect(result).toEqual({ cleared: true, sessionId: 'sess-1' });
    const patch = JSON.parse(client.queries[0].params[1]);
    expect(patch.attention).toBe(false);
    expect(patch.attention_cleared_by).toBe('Golf-3');
  });
});

describe('getAttentionFlaggedSessions', () => {
  it('is read-only and maps rows to {session_id, reason, set_at}', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [{ session_id: 'sess-1', metadata: { attention: true, attention_reason: 'stalled', attention_set_at: '2026-07-20T00:00:00Z' } }],
            error: null,
          }),
        }),
      }),
    };
    const rows = await getAttentionFlaggedSessions({ supabase });
    expect(rows).toEqual([{ session_id: 'sess-1', reason: 'stalled', set_at: '2026-07-20T00:00:00Z' }]);
  });

  it('degrades to an empty array on query error', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: new Error('boom') }) }) }) };
    const rows = await getAttentionFlaggedSessions({ supabase });
    expect(rows).toEqual([]);
  });
});
