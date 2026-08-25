/**
 * QF-20260726-593 — release_sd is SESSION-scoped, so releasing "this SD" can drop a live
 * claim on a DIFFERENT one.
 *
 * The RPC signature is release_sd(p_session_id, p_reason) — no SD argument
 * (database/migrations/20260502_release_clear_worktree_state.sql:24). Its body selects
 * sd_key from claude_sessions for that session and releases WHATEVER IT HOLDS. Making the
 * RPC SD-scoped is DDL (chairman-gated), so the QF's sanctioned alternative is enforced at
 * the shared helper: assert the session holds the SD the caller intends to release.
 */
import { describe, it, expect, vi } from 'vitest';
import { bestEffortReleaseSd } from '../../../lib/fleet/best-effort-release.mjs';

const silent = () => {};

/** Minimal supabase double: a claude_sessions row + a spyable release_sd rpc. */
function makeSupabase(heldSdKey, { fromError = null } = {}) {
  const rpc = vi.fn(async () => ({ data: { released_sd: heldSdKey }, error: null }));
  return {
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            fromError ? { data: null, error: { message: fromError } } : { data: { sd_key: heldSdKey }, error: null }
        })
      })
    })
  };
}

describe('bestEffortReleaseSd — SD-scoping guard (QF-20260726-593)', () => {
  it('THE BUG: without expectedSdKey the release fires even though the session holds an UNRELATED SD', async () => {
    const supabase = makeSupabase('SD-OTHER-999');
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'crosscheck_block', silent);
    // Unscoped legacy behavior is preserved byte-for-byte for un-migrated callers.
    expect(r.released).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('THE FIX: with expectedSdKey, a mismatch SKIPS the release — the unrelated live claim survives', async () => {
    const supabase = makeSupabase('SD-OTHER-999');
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'crosscheck_block', silent, {
      expectedSdKey: 'SD-TARGET-001'
    });
    expect(r.released).toBe(false);
    expect(r.skipped).toBe('sd_mismatch');
    expect(r.heldSdKey).toBe('SD-OTHER-999');
    // The critical assertion: the RPC was never reached, so nothing was released.
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('releases normally when the session genuinely holds the expected SD', async () => {
    const supabase = makeSupabase('SD-TARGET-001');
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'unfit:wrong_repo', silent, {
      expectedSdKey: 'SD-TARGET-001'
    });
    expect(r.released).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    // The reason names the MECHANISM — 'manual' (the RPC default) makes a mechanical
    // release byte-identical to a deliberate one and misled two prior investigations.
    expect(supabase.rpc.mock.calls[0][1].p_reason).toBe('unfit:wrong_repo');
    expect(supabase.rpc.mock.calls[0][1].p_reason).not.toBe('manual');
  });

  it('skips when the session holds NOTHING (sd_key null) — no spurious release', async () => {
    const supabase = makeSupabase(null);
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'r', silent, { expectedSdKey: 'SD-TARGET-001' });
    expect(r.skipped).toBe('sd_mismatch');
    expect(r.heldSdKey).toBeNull();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED: an unverifiable scope check refuses to release rather than degrading to unscoped', async () => {
    const supabase = makeSupabase('SD-TARGET-001', { fromError: 'db down' });
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'r', silent, { expectedSdKey: 'SD-TARGET-001' });
    expect(r.released).toBe(false);
    expect(r.skipped).toBe('scope_unverifiable');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (FR-3): scope_unverifiable propagates the underlying DB message in `error`, not just the literal skip code', async () => {
    const supabase = makeSupabase('SD-TARGET-001', { fromError: 'db down' });
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'r', silent, { expectedSdKey: 'SD-TARGET-001' });
    expect(r.error).toBe('db down');
    expect(r.skipped).toBe('scope_unverifiable'); // still the stable discriminator callers branch on
  });

  it('FAIL-CLOSED: scoping requested but the client cannot read session state (no .from)', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const r = await bestEffortReleaseSd({ rpc }, 'sess-1', 'r', silent, { expectedSdKey: 'SD-TARGET-001' });
    expect(r.skipped).toBe('scope_unverifiable');
    expect(rpc).not.toHaveBeenCalled();
  });

  // SECURITY finding, SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 EXEC-TO-PLAN: releaseClaim()/
  // releaseSessionClaim() always pass `{expectedSdKey: sdKey}` -- if `sdKey` is falsy
  // (undefined/null/''), a truthy-only check on the value treats "explicitly scoped, but
  // empty" identically to "never migrated to scoping", silently falling through to the
  // UNSCOPED legacy RPC call -- reproducing the exact QF-20260726-593 defect this SD closes.
  it('SECURITY: expectedSdKey explicitly provided but falsy REFUSES to release (does not fall through to unscoped legacy behavior)', async () => {
    const supabase = makeSupabase('SD-OTHER-999');
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'release_claim', silent, { expectedSdKey: '' });
    expect(r.released).toBe(false);
    expect(r.skipped).toBe('invalid_expected_sd_key');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('SECURITY: expectedSdKey: undefined explicitly in opts also refuses (not just a bare {})', async () => {
    const supabase = makeSupabase('SD-OTHER-999');
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'release_claim', silent, { expectedSdKey: undefined });
    expect(r.released).toBe(false);
    expect(r.skipped).toBe('invalid_expected_sd_key');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('control: omitting opts entirely still preserves legacy unscoped behavior byte-for-byte', async () => {
    const supabase = makeSupabase('SD-OTHER-999');
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'crosscheck_block', silent);
    expect(r.released).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('still NEVER throws — the no-throw contract survives the guard', async () => {
    const supabase = {
      rpc: vi.fn(async () => { throw new Error('db down'); }),
      from: () => { throw new Error('exploded'); }
    };
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'r', silent, { expectedSdKey: 'SD-TARGET-001' });
    expect(r.released).toBe(false);
  });
});
