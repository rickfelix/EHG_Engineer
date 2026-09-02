/**
 * SD-LEO-FIX-HUMAN-ACTION-FENCES-001: setHold is the WRITE-SIDE mirror of releaseHold
 * (QF-20260831-832) for SETTING a requires_human_action hold. Live re-measurement (2026-09-02)
 * found 3 of 8 current holds created that same day with zero reason and zero unfence_condition —
 * nothing enforced that a fence name what would clear it. setHold requires unfenceCondition as a
 * mandatory field and, like releaseHold, must never trust a bare "no throw" from
 * mergeMetadataKeys as proof the stamp landed and is READABLE.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/coordinator/safe-metadata-merge.mjs', () => ({
  mergeMetadataKeys: vi.fn(),
}));

const { mergeMetadataKeys } = await import('../../../lib/coordinator/safe-metadata-merge.mjs');
const { setHold } = await import('../../../lib/fleet/claim-eligibility.cjs');

/** Fake supabase-js client for the readback SELECT: .from().select().eq().maybeSingle() */
function fakeSb(readbackMetadata) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: readbackMetadata === undefined ? null : { metadata: readbackMetadata }, error: null }),
        }),
      }),
    }),
  };
}

describe('SD-LEO-FIX-HUMAN-ACTION-FENCES-001: setHold (write-side of the hold-predicate family, SET direction)', () => {
  it('rejects a missing setBy/reason/unfenceCondition before touching the DB', async () => {
    const sb = fakeSb({});
    const result = await setHold(sb, 'SD-FIXTURE-SET-001', {});
    expect(result.set).toBe(false);
    expect(result.error).toMatch(/setBy, reason, and unfenceCondition are required/);
    expect(mergeMetadataKeys).not.toHaveBeenCalled();
  });

  it('rejects when unfenceCondition alone is missing, even with setBy and reason present (the field this SD exists to require)', async () => {
    const sb = fakeSb({});
    const result = await setHold(sb, 'SD-FIXTURE-SET-002', { setBy: 'coordinator', reason: 'awaiting chairman decision' });
    expect(result.set).toBe(false);
    expect(result.error).toMatch(/unfenceCondition/);
    expect(mergeMetadataKeys).not.toHaveBeenCalled();
  });

  it('reports set:false when mergeMetadataKeys itself refuses the write', async () => {
    mergeMetadataKeys.mockResolvedValueOnce({ merged: false, error: 'row not found' });
    const sb = fakeSb({});
    const result = await setHold(sb, 'SD-FIXTURE-SET-003', { setBy: 'coordinator', reason: 'venture gate unmet', unfenceCondition: 'UNFENCE: flagship deployed + live URL' });
    expect(result.set).toBe(false);
    expect(result.error).toMatch(/row not found/);
  });

  it('HARD ACCEPTANCE: reports set:false when the write reports success but the readback shows the stamp did NOT land', async () => {
    mergeMetadataKeys.mockResolvedValueOnce({ merged: true, sdKey: 'SD-FIXTURE-SET-004' });
    const sb = fakeSb({}); // readback: metadata present but requires_human_action_at/unfence_condition absent
    const result = await setHold(sb, 'SD-FIXTURE-SET-004', { setBy: 'coordinator', reason: 'awaiting decision', unfenceCondition: 'UNFENCE: chairman go/defer' });
    expect(result.set).toBe(false);
    expect(result.error).toMatch(/readback mismatch/);
  });

  it('reports set:false when the readback finds no row at all', async () => {
    mergeMetadataKeys.mockResolvedValueOnce({ merged: true, sdKey: 'SD-FIXTURE-SET-005' });
    const sb = fakeSb(undefined);
    const result = await setHold(sb, 'SD-FIXTURE-SET-005', { setBy: 'coordinator', reason: 'awaiting decision', unfenceCondition: 'UNFENCE: chairman go/defer' });
    expect(result.set).toBe(false);
    expect(result.error).toMatch(/readback found no row/);
  });

  it('reports set:true ONLY when the write succeeds AND the readback confirms the exact stamped values, using the SAME unfence_condition key the chairman-gated-decision-row-guard consumer reads', async () => {
    let stampedPatch;
    mergeMetadataKeys.mockImplementationOnce(async (sdKey, patch) => {
      stampedPatch = patch;
      return { merged: true, sdKey };
    });
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: {
                metadata: {
                  requires_human_action: true,
                  requires_human_action_reason: stampedPatch.requires_human_action_reason,
                  requires_human_action_by: stampedPatch.requires_human_action_by,
                  requires_human_action_at: stampedPatch.requires_human_action_at,
                  unfence_condition: stampedPatch.unfence_condition,
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    const result = await setHold(sb, 'SD-FIXTURE-SET-006', { setBy: 'coordinator', reason: 'venture gate unmet', unfenceCondition: 'UNFENCE: flagship deployed + live URL' });
    expect(result).toEqual({ set: true, sdKey: 'SD-FIXTURE-SET-006' });
    expect(stampedPatch.unfence_condition).toBe('UNFENCE: flagship deployed + live URL');
  });
});
