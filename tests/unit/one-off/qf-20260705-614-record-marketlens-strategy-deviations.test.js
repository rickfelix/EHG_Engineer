/**
 * Unit test for the QF-20260705-614 remediation script (deviation-documentation sweep
 * for MarketLens's 14 strategy-layer verdicts, cluster CL-7). Mocked supabase — no live
 * DB writes; the actual 14 rows were already recorded via a one-time live run
 * (verified via LEFT JOIN in the QF completion notes).
 */
import { describe, it, expect, vi } from 'vitest';
import { main, VENTURE_ID, CLAIM_REFS, WHY, INSTEAD_NOTES } from '../../../scripts/one-off/qf-20260705-614-record-marketlens-strategy-deviations.mjs';
import { ARTIFACT_TYPES } from '../../../lib/eva/artifact-types.js';

function createMockSupabase() {
  const insertedRows = [];
  const fromMock = vi.fn().mockImplementation(() => ({
    insert: vi.fn().mockImplementation((row) => {
      insertedRows.push(row);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: `deviation-${insertedRows.length}` }, error: null }),
        }),
      };
    }),
  }));
  return { from: fromMock, _insertedRows: insertedRows };
}

describe('QF-20260705-614: CLAIM_REFS / constants', () => {
  it('has exactly 14 unique claim_refs (cluster CL-7)', () => {
    expect(CLAIM_REFS).toHaveLength(14);
    expect(new Set(CLAIM_REFS).size).toBe(14);
  });
  it('WHY names the design intent, not a bug', () => {
    expect(WHY).toMatch(/not product-wired by design/);
  });
  it('only marketing_tagline carries a content-refresh instead-note', () => {
    expect(Object.keys(INSTEAD_NOTES)).toEqual(['marketing_tagline']);
    expect(INSTEAD_NOTES.marketing_tagline).toMatch(/99 chars/);
  });
});

describe('QF-20260705-614: main() (mocked supabase)', () => {
  it('records one declared-descope deviation per claim_ref for the target venture', async () => {
    const supabase = createMockSupabase();
    const results = await main(supabase);

    expect(results).toHaveLength(14);
    expect(supabase._insertedRows).toHaveLength(14);
    supabase._insertedRows.forEach((row, i) => {
      expect(row.venture_id).toBe(VENTURE_ID);
      expect(row.artifact_type).toBe(ARTIFACT_TYPES.BUILD_DEVIATION_RECORD);
      expect(row.artifact_data.artifact_ref).toBe(CLAIM_REFS[i]);
      expect(row.artifact_data.weight).toBe('declared-descope');
      expect(row.artifact_data.why).toBe(WHY);
      expect(row.is_current).toBe(false);
    });
  });

  it('attaches the content-refresh note only to the marketing_tagline row', async () => {
    const supabase = createMockSupabase();
    await main(supabase);
    const taglineRow = supabase._insertedRows.find((r) => r.artifact_data.artifact_ref === 'marketing_tagline');
    const otherRow = supabase._insertedRows.find((r) => r.artifact_data.artifact_ref === 'truth_idea_brief');
    expect(taglineRow.artifact_data.instead).toMatch(/99 chars/);
    expect(otherRow.artifact_data.instead).toBeNull();
  });
});
