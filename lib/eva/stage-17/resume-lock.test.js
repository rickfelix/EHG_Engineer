/**
 * Vitest spec for the Stage 17 resume-endpoint idempotency lock.
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM F
 *
 * The lock helpers operate over a small slice of the Supabase API
 * (.from(...).select().eq().eq().eq().maybeSingle() and .update().eq()).
 * We hand-roll a minimal in-memory mock that supports just that surface
 * — pulling in the real Supabase JS client for unit tests would add
 * weight without raising signal.
 */

import { describe, it, expect, vi } from 'vitest';
import { acquireResumeLock, releaseResumeLock, RESUME_LOCK_TTL_MS } from './resume-lock.js';

function makeSupabaseMock(initialRows = []) {
  // Tiny query-chain matcher tailored to acquireResumeLock / releaseResumeLock.
  let rows = initialRows.map((r) => ({ ...r }));
  const calls = [];

  return {
    from(_table) {
      const filters = {};
      const builder = {
        select() { return builder; },
        eq(col, val) { filters[col] = val; return builder; },
        async maybeSingle() {
          calls.push({ op: 'select', filters: { ...filters } });
          const match = rows.find((r) =>
            Object.entries(filters).every(([k, v]) => r[k] === v)
          );
          return { data: match || null, error: null };
        },
        update(patch) {
          return {
            async eq(col, val) {
              calls.push({ op: 'update', match: { [col]: val }, patch });
              const idx = rows.findIndex((r) => r[col] === val);
              if (idx === -1) return { error: { message: 'not found' } };
              rows[idx] = { ...rows[idx], ...patch };
              return { error: null };
            },
          };
        },
        async insert(payload) {
          calls.push({ op: 'insert', payload });
          rows.push({ id: `row-${rows.length + 1}`, ...payload });
          return { data: payload, error: null };
        },
      };
      return builder;
    },
    _rows: () => rows,
    _calls: () => calls,
  };
}

describe('acquireResumeLock', () => {
  const ventureId = '00000000-0000-0000-0000-000000000001';

  it('acquires fresh lock when no session_state row exists (bootstrap path skipped in unit; assert no-row→writeArtifact would be called)', async () => {
    // For the no-existing-row path, the helper imports artifact-persistence-service.
    // We test that path indirectly — here we assert the reader returns null cleanly.
    const sb = makeSupabaseMock([]);
    // Spy on writeArtifact import so the bootstrap path doesn't actually hit Supabase
    vi.doMock('../artifact-persistence-service.js', () => ({
      writeArtifact: vi.fn(async () => 'bootstrap-id'),
    }));
    // Re-import after mock (vitest hoists)
    const mod = await import('./resume-lock.js');
    const result = await mod.acquireResumeLock(sb, ventureId);
    expect(result.acquired).toBe(true);
    expect(typeof result.token).toBe('string');
    expect(typeof result.expiresAt).toBe('string');
    vi.doUnmock('../artifact-persistence-service.js');
  });

  it('acquires fresh lock when row exists but has no resume_lock', async () => {
    const sb = makeSupabaseMock([{
      id: 'row-1',
      venture_id: ventureId,
      artifact_type: 's17_session_state',
      is_current: true,
      metadata: { progressUpdate: true },
    }]);
    const result = await acquireResumeLock(sb, ventureId);
    expect(result.acquired).toBe(true);
    expect(result.token).toBeTypeOf('string');

    const stored = sb._rows()[0].metadata.resume_lock;
    expect(stored.token).toBe(result.token);
    expect(stored.expires_at).toBe(result.expiresAt);
    // Pre-existing metadata is preserved
    expect(sb._rows()[0].metadata.progressUpdate).toBe(true);
  });

  it('refuses to acquire when an unexpired lock already exists', async () => {
    const futureExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const sb = makeSupabaseMock([{
      id: 'row-1',
      venture_id: ventureId,
      artifact_type: 's17_session_state',
      is_current: true,
      metadata: { resume_lock: { token: 'pre-existing', expires_at: futureExpires, acquired_at: '2026-04-26T00:00:00.000Z' } },
    }]);
    const result = await acquireResumeLock(sb, ventureId);
    expect(result.acquired).toBe(false);
    expect(result.reason).toBe('LOCKED');
    expect(result.existingExpiresAt).toBe(futureExpires);
  });

  it('reclaims the lock when the existing one has expired', async () => {
    const pastExpires = new Date(Date.now() - 60_000).toISOString();
    const sb = makeSupabaseMock([{
      id: 'row-1',
      venture_id: ventureId,
      artifact_type: 's17_session_state',
      is_current: true,
      metadata: { resume_lock: { token: 'old', expires_at: pastExpires, acquired_at: '2026-04-25T00:00:00.000Z' } },
    }]);
    const result = await acquireResumeLock(sb, ventureId);
    expect(result.acquired).toBe(true);
    expect(result.token).not.toBe('old');
    expect(sb._rows()[0].metadata.resume_lock.token).toBe(result.token);
  });

  it('honors options.ttlMs', async () => {
    const sb = makeSupabaseMock([{
      id: 'row-1',
      venture_id: ventureId,
      artifact_type: 's17_session_state',
      is_current: true,
      metadata: {},
    }]);
    const fixedNow = 1_700_000_000_000;
    const result = await acquireResumeLock(sb, ventureId, { ttlMs: 60_000, now: () => fixedNow });
    expect(new Date(result.expiresAt).getTime()).toBe(fixedNow + 60_000);
    expect(RESUME_LOCK_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe('releaseResumeLock', () => {
  const ventureId = '00000000-0000-0000-0000-000000000001';

  it('releases when token matches', async () => {
    const sb = makeSupabaseMock([{
      id: 'row-1',
      venture_id: ventureId,
      artifact_type: 's17_session_state',
      is_current: true,
      metadata: { resume_lock: { token: 'tok-1', expires_at: 'x', acquired_at: 'y' }, otherKey: 'preserved' },
    }]);
    const result = await releaseResumeLock(sb, ventureId, 'tok-1');
    expect(result.released).toBe(true);
    expect(sb._rows()[0].metadata.resume_lock).toBeUndefined();
    expect(sb._rows()[0].metadata.otherKey).toBe('preserved');
  });

  it('rejects when token does not match', async () => {
    const sb = makeSupabaseMock([{
      id: 'row-1',
      venture_id: ventureId,
      artifact_type: 's17_session_state',
      is_current: true,
      metadata: { resume_lock: { token: 'right', expires_at: 'x', acquired_at: 'y' } },
    }]);
    const result = await releaseResumeLock(sb, ventureId, 'wrong');
    expect(result.released).toBe(false);
    expect(result.reason).toBe('TOKEN_MISMATCH');
    // Lock is preserved on mismatch
    expect(sb._rows()[0].metadata.resume_lock.token).toBe('right');
  });

  it('returns NO_LOCK when no lock exists', async () => {
    const sb = makeSupabaseMock([{
      id: 'row-1',
      venture_id: ventureId,
      artifact_type: 's17_session_state',
      is_current: true,
      metadata: {},
    }]);
    const result = await releaseResumeLock(sb, ventureId, 'any-token');
    expect(result.released).toBe(false);
    expect(result.reason).toBe('NO_LOCK');
  });

  it('returns NO_TOKEN when called without a token', async () => {
    const sb = makeSupabaseMock([]);
    const result = await releaseResumeLock(sb, ventureId, '');
    expect(result.released).toBe(false);
    expect(result.reason).toBe('NO_TOKEN');
  });
});
