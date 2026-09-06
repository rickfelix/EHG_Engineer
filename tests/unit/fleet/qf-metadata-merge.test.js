/**
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (Child E) — lib/fleet/qf-metadata-merge.mjs.
 *
 * TS-3/AC-4: quick_fixes.metadata absent (42703) degrades fail-soft, distinguishable reason.
 * TS-4/AC-5: an existing metadata blob is preserved (additive merge), under the CAS guard.
 * TS-10: a lost compare-and-swap (claim moved to another session) is distinguishable from 42703.
 * TS-9: safe to run this whole suite against a live (unapplied) schema — it never touches a
 *       real DB; createDatabaseClient is injected/mocked in every case.
 *
 * Mocks a minimal pg-like client ({query, end}) since mergeQfMetadataKeys goes through
 * scripts/lib/supabase-connection.js's createDatabaseClient (raw pg), not supabase-js — mirrors
 * the seam lib/coordinator/safe-metadata-merge.mjs's own tests use for the SD-side equivalent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const endMock = vi.fn(async () => {});

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createDatabaseClient: vi.fn(async () => ({ query: queryMock, end: endMock })),
}));

const { mergeQfMetadataKeys } = await import('../../../lib/fleet/qf-metadata-merge.mjs');

beforeEach(() => {
  queryMock.mockReset();
  endMock.mockReset();
});

describe('mergeQfMetadataKeys', () => {
  it('rejects a missing qfId/sessionId/entry without touching the database', async () => {
    const result = await mergeQfMetadataKeys(null, 'sess-1', { a: 1 });
    expect(result).toMatchObject({ merged: false, reason: 'error' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('TS-4/AC-5: reports merged:true on a successful CAS-guarded UPDATE (1 row affected)', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });
    const entry = { session_id: 'sess-1', claimed_at: '2026-09-06T00:00:00.000Z', pick_reason: { score: 'UNSCORED', components: {}, comparatorVersion: null } };
    const result = await mergeQfMetadataKeys('QF-20260906-1', 'sess-1', entry);
    expect(result).toEqual({ merged: true });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/jsonb_set/);
    expect(sql).toMatch(/claiming_session_id = \$2/);
    expect(params).toEqual(['QF-20260906-1', 'sess-1', JSON.stringify([entry])]);
  });

  it('TS-10: a lost compare-and-swap (0 rows affected) is distinguishable from column_absent', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });
    const result = await mergeQfMetadataKeys('QF-20260906-2', 'sess-stale', { session_id: 'sess-stale', claimed_at: 'x' });
    expect(result).toEqual({ merged: false, reason: 'cas_lost' });
  });

  it('TS-3/AC-4: a 42703 (undefined_column) error degrades fail-soft with a distinguishable reason', async () => {
    const err = new Error('column "metadata" does not exist');
    err.code = '42703';
    queryMock.mockRejectedValueOnce(err);
    const result = await mergeQfMetadataKeys('QF-20260906-3', 'sess-1', { session_id: 'sess-1', claimed_at: 'x' });
    expect(result).toEqual({ merged: false, reason: 'column_absent' });
  });

  it('a genuine unexpected error is reported distinctly from column_absent and cas_lost', async () => {
    const err = new Error('connection reset');
    err.code = '08006';
    queryMock.mockRejectedValueOnce(err);
    const result = await mergeQfMetadataKeys('QF-20260906-4', 'sess-1', { session_id: 'sess-1', claimed_at: 'x' });
    expect(result.merged).toBe(false);
    expect(result.reason).toBe('error');
    expect(result.reason).not.toBe('column_absent');
    expect(result.reason).not.toBe('cas_lost');
  });

  it('always closes the client, even on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));
    await mergeQfMetadataKeys('QF-20260906-5', 'sess-1', { session_id: 'sess-1', claimed_at: 'x' });
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
