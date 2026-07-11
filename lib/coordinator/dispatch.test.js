/**
 * Unit tests for the coordinator dispatch guard.
 * SD-LEO-INFRA-COORDINATOR-DISPATCH-TARGET-001 (FR-6).
 *
 * Network-free: an injected fake supabase records insert calls and returns a
 * configurable claude_sessions lookup result.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isFullUuid,
  isSentinelTarget,
  SENTINEL_TARGETS,
  insertCoordinationRow,
} = require('./dispatch.cjs');

const LIVE_UUID = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const UNKNOWN_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// Fake supabase: claude_sessions lookup returns `sessionRow` (or null); every
// session_coordination insert is recorded in `inserts`.
function makeFakeSupabase({ sessionRow = null, lookupError = null } = {}) {
  const inserts = [];
  const sb = {
    from(table) {
      if (table === 'claude_sessions') {
        const b = {
          select() { return b; },
          eq() { return b; },
          limit() { return b; },
          maybeSingle() { return Promise.resolve({ data: sessionRow, error: lookupError }); },
        };
        return b;
      }
      if (table === 'session_coordination') {
        return {
          insert(row) {
            inserts.push(row);
            const res = { data: [{ id: 'row-1' }], error: null };
            const thenable = {
              select() { return thenable; },
              single() { return Promise.resolve({ data: { id: 'row-1' }, error: null }); },
              then(resolve) { return Promise.resolve(res).then(resolve); },
            };
            return thenable;
          },
        };
      }
      throw new Error('unexpected table ' + table);
    },
  };
  return { sb, inserts };
}

const silent = { error() {} };

describe('dispatch guard — pure helpers', () => {
  it('isFullUuid accepts a full 8-4-4-4-12 UUID', () => {
    expect(isFullUuid(LIVE_UUID)).toBe(true);
  });
  it('isFullUuid rejects an 8-char prefix and a partial UUID', () => {
    expect(isFullUuid('0f8d45d8')).toBe(false);
    expect(isFullUuid('0f8d45d8-9531-4ab8')).toBe(false);
    expect(isFullUuid(null)).toBe(false);
  });
  it('sentinels are exactly broadcast / broadcast-coordinator', () => {
    expect(SENTINEL_TARGETS).toContain('broadcast');
    expect(SENTINEL_TARGETS).toContain('broadcast-coordinator');
    expect(isSentinelTarget('broadcast')).toBe(true);
    expect(isSentinelTarget('not-a-sentinel')).toBe(false);
  });
});

describe('insertCoordinationRow — accept/reject matrix (FR-2/3/4)', () => {
  it('ACCEPTS a full UUID matching a live claude_sessions row', async () => {
    const { sb, inserts } = makeFakeSupabase({ sessionRow: { session_id: LIVE_UUID } });
    await insertCoordinationRow(sb, { target_session: LIVE_UUID, message_type: 'WORK_ASSIGNMENT' }, { logger: silent });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].target_session).toBe(LIVE_UUID);
  });

  it('REFUSES an 8-char prefix target — no insert (FR-2)', async () => {
    const { sb, inserts } = makeFakeSupabase({ sessionRow: { session_id: LIVE_UUID } });
    await expect(
      insertCoordinationRow(sb, { target_session: '0f8d45d8', message_type: 'WORK_ASSIGNMENT' }, { logger: silent })
    ).rejects.toMatchObject({ code: 'DISPATCH_TARGET_INVALID' });
    expect(inserts).toHaveLength(0);
  });

  it('REFUSES a partial (8-4-4) UUID that the old prefix regex would pass — no insert', async () => {
    const { sb, inserts } = makeFakeSupabase({ sessionRow: { session_id: LIVE_UUID } });
    await expect(
      insertCoordinationRow(sb, { target_session: '0f8d45d8-9531-4ab8', message_type: 'COACHING' }, { logger: silent })
    ).rejects.toMatchObject({ code: 'DISPATCH_TARGET_INVALID' });
    expect(inserts).toHaveLength(0);
  });

  it('REFUSES a well-formed but unknown UUID (no live session) — no insert (FR-3)', async () => {
    const { sb, inserts } = makeFakeSupabase({ sessionRow: null });
    await expect(
      insertCoordinationRow(sb, { target_session: UNKNOWN_UUID, message_type: 'WORK_ASSIGNMENT' }, { logger: silent })
    ).rejects.toMatchObject({ code: 'DISPATCH_TARGET_UNKNOWN' });
    expect(inserts).toHaveLength(0);
  });

  it('ACCEPTS sentinel broadcast WITHOUT a live-session lookup (FR-4)', async () => {
    // sessionRow=null would reject any UUID; sentinel must short-circuit and still insert.
    const { sb, inserts } = makeFakeSupabase({ sessionRow: null });
    await insertCoordinationRow(sb, { target_session: 'broadcast', message_type: 'COACHING' }, { logger: silent });
    expect(inserts).toHaveLength(1);
  });

  it('ACCEPTS sentinel broadcast-coordinator WITHOUT a live-session lookup (FR-4)', async () => {
    const { sb, inserts } = makeFakeSupabase({ sessionRow: null });
    await insertCoordinationRow(sb, { target_session: 'broadcast-coordinator', message_type: 'INFO' }, { logger: silent });
    expect(inserts).toHaveLength(1);
  });

  // QF-20260710-750: a claude_sessions ROW existing is not the same as being LIVE.
  it('REFUSES a live-row UUID whose heartbeat is stale (>10min) — no insert', async () => {
    const staleHeartbeat = new Date(Date.now() - 15 * 60_000).toISOString();
    const { sb, inserts } = makeFakeSupabase({ sessionRow: { session_id: LIVE_UUID, heartbeat_at: staleHeartbeat } });
    await expect(
      insertCoordinationRow(sb, { target_session: LIVE_UUID, message_type: 'COACHING' }, { logger: silent })
    ).rejects.toMatchObject({ code: 'DISPATCH_TARGET_STALE' });
    expect(inserts).toHaveLength(0);
  });

  it('ACCEPTS a live-row UUID with a fresh heartbeat (<10min)', async () => {
    const freshHeartbeat = new Date(Date.now() - 2 * 60_000).toISOString();
    const { sb, inserts } = makeFakeSupabase({ sessionRow: { session_id: LIVE_UUID, heartbeat_at: freshHeartbeat } });
    await insertCoordinationRow(sb, { target_session: LIVE_UUID, message_type: 'COACHING' }, { logger: silent });
    expect(inserts).toHaveLength(1);
  });

  it('ACCEPTS a live-row UUID with no heartbeat_at in the lookup (fail-open on unconfirmed, not certain-dead)', async () => {
    const { sb, inserts } = makeFakeSupabase({ sessionRow: { session_id: LIVE_UUID } });
    await insertCoordinationRow(sb, { target_session: LIVE_UUID, message_type: 'COACHING' }, { logger: silent });
    expect(inserts).toHaveLength(1);
  });

  it('fails CLOSED when the live-session lookup errors — no insert', async () => {
    const { sb, inserts } = makeFakeSupabase({ lookupError: { message: 'db down' } });
    await expect(
      insertCoordinationRow(sb, { target_session: LIVE_UUID, message_type: 'WORK_ASSIGNMENT' }, { logger: silent })
    ).rejects.toMatchObject({ code: 'DISPATCH_LOOKUP_FAILED' });
    expect(inserts).toHaveLength(0);
  });

  it('supports select/single for callers needing the inserted id', async () => {
    const { sb } = makeFakeSupabase({ sessionRow: { session_id: LIVE_UUID } });
    const res = await insertCoordinationRow(
      sb, { target_session: LIVE_UUID, message_type: 'INFO' }, { logger: silent, select: 'id', single: true }
    );
    expect(res.data.id).toBe('row-1');
  });
});
