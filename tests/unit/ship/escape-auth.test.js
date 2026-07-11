/**
 * SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 FR-3
 * writeEscapeAuditRow() dual-key enforcement + createEscapeAuditChecker() lookup shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { writeEscapeAuditRow, createEscapeAuditChecker } from '../../../lib/ship/escape-auth.mjs';

function makeSupabase({ insertError = null, selectData = [] } = {}) {
  const insert = vi.fn(async () => ({ error: insertError }));
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(async () => ({ data: selectData, error: null })),
      })),
    })),
  }));
  return { from: vi.fn(() => ({ insert, select })), _insert: insert };
}

describe('writeEscapeAuditRow', () => {
  it('throws when pr identity (prNumber/repo) is missing — dual-key requires both keys', async () => {
    const supabase = makeSupabase();
    await expect(writeEscapeAuditRow(supabase, { sessionId: 's1' }))
      .rejects.toThrow(/dual-key: merge identity/);
  });

  it('throws when sessionId is missing — dual-key requires both keys', async () => {
    const supabase = makeSupabase();
    await expect(writeEscapeAuditRow(supabase, { prNumber: 1, repo: 'o/r' }))
      .rejects.toThrow(/dual-key: actor identity/);
  });

  it('inserts a row with both keys present', async () => {
    const supabase = makeSupabase();
    await writeEscapeAuditRow(supabase, { prNumber: 42, repo: 'o/r', sessionId: 's1', reason: 'test' });
    expect(supabase._insert).toHaveBeenCalledWith(expect.objectContaining({
      pr_number: 42, repo: 'o/r', session_id: 's1', reason: 'test',
    }));
  });

  it('throws on insert error', async () => {
    const supabase = makeSupabase({ insertError: { message: 'RLS denied' } });
    await expect(writeEscapeAuditRow(supabase, { prNumber: 1, repo: 'o/r', sessionId: 's1' }))
      .rejects.toThrow(/RLS denied/);
  });
});

describe('createEscapeAuditChecker', () => {
  it('returns true when a row exists', async () => {
    const checker = createEscapeAuditChecker(makeSupabase({ selectData: [{ id: 'a' }] }));
    expect(await checker(42, 'o', 'r')).toBe(true);
  });

  it('returns false when no row exists', async () => {
    const checker = createEscapeAuditChecker(makeSupabase({ selectData: [] }));
    expect(await checker(42, 'o', 'r')).toBe(false);
  });

  it('returns null when supabase is not supplied', async () => {
    const checker = createEscapeAuditChecker(null);
    expect(await checker(42, 'o', 'r')).toBeNull();
  });

  it('returns null when the query throws', async () => {
    const throwing = { from: () => { throw new Error('down'); } };
    const checker = createEscapeAuditChecker(throwing);
    expect(await checker(42, 'o', 'r')).toBeNull();
  });
});
