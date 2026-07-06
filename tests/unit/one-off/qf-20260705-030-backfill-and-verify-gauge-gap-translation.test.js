/**
 * Unit test for the QF-20260705-030 backfill script. Mocked supabase — no live DB writes.
 * QF-20260705-030 found the adversarial sweep's premise wrong (the flag is ON, the translator is
 * wired correctly) and instead backfills stale pre-translation rows for provenance accuracy.
 */
import { describe, it, expect, vi } from 'vitest';
import { main } from '../../../scripts/one-off/qf-20260705-030-backfill-and-verify-gauge-gap-translation.mjs';

function createMockSupabase({ rows, updateError = null, auditError = null }) {
  const updates = [];
  const audits = [];
  const fromMock = vi.fn().mockImplementation((table) => {
    if (table === 'roadmap_wave_items') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
        update: vi.fn().mockImplementation((patch) => {
          updates.push(patch);
          return { eq: vi.fn().mockResolvedValue({ error: updateError }) };
        }),
      };
    }
    if (table === 'audit_log') {
      return {
        insert: vi.fn().mockImplementation((row) => {
          audits.push(row);
          return Promise.resolve({ error: auditError });
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock, _updates: updates, _audits: audits };
}

describe('QF-20260705-030: main() (mocked supabase)', () => {
  it('backfills only rows missing metadata.translated, skips already-translated ones', async () => {
    const rows = [
      { id: 'a', metadata: { capability: 'X', gauge_status: 'unbuilt', nature: 'operational' } },
      { id: 'b', metadata: { capability: 'Y', gauge_status: 'partial', nature: 'buildable', translated: true } },
    ];
    const supabase = createMockSupabase({ rows });
    const result = await main(supabase);

    expect(result).toEqual({ backfilled: 1, total: 2 });
    expect(supabase._updates).toHaveLength(1);
    expect(supabase._updates[0].metadata.translated).toBe(true);
    expect(supabase._updates[0].metadata.capability).toBe('X'); // original metadata preserved
    expect(supabase._updates[0].title).toMatch(/^Realize VDR capability: X/);
  });

  it('leaves a run-evidence audit_log row', async () => {
    const rows = [{ id: 'a', metadata: { capability: 'X', gauge_status: 'unbuilt', nature: 'operational' } }];
    const supabase = createMockSupabase({ rows });
    await main(supabase);
    expect(supabase._audits).toHaveLength(1);
    expect(supabase._audits[0].event_type).toBe('gauge_gap_translation_verification');
    expect(supabase._audits[0].metadata.backfilled).toBe(1);
  });

  it('is a no-op (0 backfilled) when all rows are already translated', async () => {
    const rows = [{ id: 'a', metadata: { capability: 'X', translated: true } }];
    const supabase = createMockSupabase({ rows });
    const result = await main(supabase);
    expect(result).toEqual({ backfilled: 0, total: 1 });
    expect(supabase._updates).toHaveLength(0);
  });

  it('throws on an update error instead of silently swallowing it', async () => {
    const rows = [{ id: 'a', metadata: { capability: 'X' } }];
    const supabase = createMockSupabase({ rows, updateError: { message: 'boom' } });
    await expect(main(supabase)).rejects.toThrow('boom');
  });
});
