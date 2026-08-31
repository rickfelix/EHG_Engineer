/**
 * QF-20260831-832: releaseHold is the WRITE-SIDE member of the single-hold-predicate family
 * QF-20260831-936 unifies on the read side. resolveHoldProvenance() reads metadata.unfenced_at,
 * but no code path wrote it before this fix — a release mechanism whose release field has no
 * writer is ABSENT, not slow (0b1f1d7e).
 *
 * Hard acceptance (Solomon a05d6f0c, fix-is-blind-too class): a caller must never trust a bare
 * "no throw" from mergeMetadataKeys as proof the stamp landed and is READABLE — releaseHold must
 * read back the row and report untouched rows as failures, never a clean sweep.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/coordinator/safe-metadata-merge.mjs', () => ({
  mergeMetadataKeys: vi.fn(),
}));

const { mergeMetadataKeys } = await import('../../../lib/coordinator/safe-metadata-merge.mjs');
const { releaseHold } = await import('../../../lib/fleet/claim-eligibility.cjs');

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

describe('QF-20260831-832: releaseHold (write-side of the hold-predicate family)', () => {
  it('rejects a missing releaser/reason before touching the DB (audit-trail requirement)', async () => {
    const sb = fakeSb({});
    const result = await releaseHold(sb, 'SD-FIXTURE-RELEASE-001', {});
    expect(result.released).toBe(false);
    expect(result.error).toMatch(/releaser and reason are required/);
    expect(mergeMetadataKeys).not.toHaveBeenCalled();
  });

  it('reports released:false when mergeMetadataKeys itself refuses the write (e.g. decider-pairing rejection)', async () => {
    mergeMetadataKeys.mockResolvedValueOnce({ merged: false, error: 'requires_human_action=true without a decider' });
    const sb = fakeSb({});
    const result = await releaseHold(sb, 'SD-FIXTURE-RELEASE-002', { releaser: 'chairman', reason: 'no longer applicable' });
    expect(result.released).toBe(false);
    expect(result.error).toMatch(/decider/);
  });

  it('HARD ACCEPTANCE: reports released:false when the write reports success but the readback shows the stamp did NOT land (silent no-op)', async () => {
    mergeMetadataKeys.mockResolvedValueOnce({ merged: true, sdKey: 'SD-FIXTURE-RELEASE-003' });
    const sb = fakeSb({}); // readback: metadata present but unfenced_at absent -- the exact blind-spot shape
    const result = await releaseHold(sb, 'SD-FIXTURE-RELEASE-003', { releaser: 'chairman', reason: 'stale hold' });
    expect(result.released).toBe(false);
    expect(result.error).toMatch(/readback mismatch/);
  });

  it('reports released:false when the readback finds no row at all', async () => {
    mergeMetadataKeys.mockResolvedValueOnce({ merged: true, sdKey: 'SD-FIXTURE-RELEASE-004' });
    const sb = fakeSb(undefined); // maybeSingle resolves data:null
    const result = await releaseHold(sb, 'SD-FIXTURE-RELEASE-004', { releaser: 'chairman', reason: 'stale hold' });
    expect(result.released).toBe(false);
    expect(result.error).toMatch(/readback found no row/);
  });

  it('reports released:true ONLY when the write succeeds AND the readback confirms the exact stamped value', async () => {
    let stampedAt;
    mergeMetadataKeys.mockImplementationOnce(async (sdKey, patch) => {
      stampedAt = patch.unfenced_at;
      return { merged: true, sdKey };
    });
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { metadata: { unfenced_at: stampedAt, unfenced_by: 'chairman', unfenced_reason: 'stale hold' } }, error: null }),
          }),
        }),
      }),
    };
    const result = await releaseHold(sb, 'SD-FIXTURE-RELEASE-005', { releaser: 'chairman', reason: 'stale hold' });
    expect(result).toEqual({ released: true, sdKey: 'SD-FIXTURE-RELEASE-005' });
  });
});
