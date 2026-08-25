/**
 * SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (FR-2) — claim-swapper.js's releaseClaim() hardened
 * with bestEffortReleaseSd(expectedSdKey), replacing a duplicate caller-side pre-check +
 * raw rpc('release_sd', ...) call. No dedicated unit test previously existed for this
 * function (TESTING sub-agent finding, PLAN-TO-EXEC, row cf170e02-51ac-44ac-8092-493c28c3fc51).
 *
 * These tests pin the external {success, reason} contract byte-for-byte across all three
 * outcomes bestEffortReleaseSd can report: released, sd_mismatch (both "holds nothing" and
 * "holds a different SD" sub-cases), and scope_unverifiable.
 */
import { describe, it, expect, vi } from 'vitest';
import { releaseClaim } from '../../../scripts/modules/handoff/claim-swapper.js';

vi.mock('../../../lib/lifecycle/worktree-state-writer.mjs', () => ({ clearWorktreeState: vi.fn() }));

function makeSupabase(heldSdKey, { fromError = null, rpcError = null } = {}) {
  const rpc = vi.fn(async () => (rpcError ? { data: null, error: { message: rpcError } } : { data: { success: true }, error: null }));
  return {
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            fromError
              ? { data: null, error: { message: fromError } }
              : { data: heldSdKey === null ? null : { sd_key: heldSdKey }, error: null }
        })
      })
    })
  };
}

describe('releaseClaim (claim-swapper.js, FR-2)', () => {
  it('succeeds when the session genuinely holds the SD being released', async () => {
    const sb = makeSupabase('SD-X-001');
    const r = await releaseClaim(sb, 'sess-1', 'SD-X-001');
    expect(r).toEqual({ success: true, reason: 'Released SD-X-001' });
    expect(sb.rpc).toHaveBeenCalledWith('release_sd', { p_session_id: 'sess-1', p_reason: 'release_claim' });
  });

  it('fails without calling the RPC when the session holds a DIFFERENT SD (QF-20260726-593)', async () => {
    const sb = makeSupabase('SD-OTHER-001');
    const r = await releaseClaim(sb, 'sess-1', 'SD-X-001');
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/SD-OTHER-001/);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('fails without calling the RPC when the session holds nothing', async () => {
    const sb = makeSupabase(null);
    const r = await releaseClaim(sb, 'sess-1', 'SD-X-001');
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/holds nothing/);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('fails closed (does not call the RPC) when the live scope check itself errors, surfacing the underlying DB message', async () => {
    const sb = makeSupabase(null, { fromError: 'connection reset' });
    const r = await releaseClaim(sb, 'sess-1', 'SD-X-001');
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/connection reset/);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('reports failure (not success) when the RPC itself errors', async () => {
    const sb = makeSupabase('SD-X-001', { rpcError: 'db down' });
    const r = await releaseClaim(sb, 'sess-1', 'SD-X-001');
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/db down/);
  });

  it('SECURITY: a falsy sdKey never falls through to the unscoped legacy RPC call (QF-20260726-593 class)', async () => {
    const sb = makeSupabase('SD-OTHER-999');
    const r = await releaseClaim(sb, 'sess-1', '');
    expect(r.success).toBe(false);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('never maps success:!error — a null error on a mismatch must not read as success', async () => {
    // sd_mismatch resolves with error:null (it's an expected skip, not a DB error) — a naive
    // `success: !res.error` mapping would misreport this exact case as a success.
    const sb = makeSupabase('SD-OTHER-001');
    const r = await releaseClaim(sb, 'sess-1', 'SD-X-001');
    expect(r.success).toBe(false);
  });
});
