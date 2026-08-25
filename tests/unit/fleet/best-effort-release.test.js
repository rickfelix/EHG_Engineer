/**
 * SD-LEO-INFRA-CLAIM-FITNESS-FAILOPEN-BYPASS-001 (FR-4) — bestEffortReleaseSd no-throw contract.
 *
 * The bug: `await supabase.rpc('release_sd', {...}).catch(() => {})` — a PostgREST builder is THENABLE
 * but has NO .catch, so `.catch` threw a TypeError BEFORE the blocking process.exit(1), and the outer
 * catch swallowed it as fail-OPEN -> an UNFIT (wrong-target_application) SD got claimed anyway. The
 * helper awaits the builder inside try/catch and NEVER throws, so the caller's unconditional block/exit
 * always proceeds (fail-CLOSED on the claim, best-effort on the cleanup).
 */
import { describe, it, expect, vi } from 'vitest';
import { bestEffortReleaseSd } from '../../../lib/fleet/best-effort-release.mjs';

const silent = () => {};

describe('bestEffortReleaseSd', () => {
  it('REPRO: a PostgREST builder is thenable but has NO .catch (calling .catch on it throws)', () => {
    const builder = { then: (resolve) => resolve({ data: null, error: null }) }; // no .catch
    expect(typeof builder.then).toBe('function');
    expect(builder.catch).toBeUndefined();
    // The OLD code did `builder.catch(() => {})` -> TypeError. Confirm the repro:
    expect(() => builder.catch(() => {})).toThrow(TypeError);
  });

  it('resolves {released:true} when .rpc returns a thenable-only builder (no throw — the bug is gone)', async () => {
    const supabase = { rpc: () => ({ then: (resolve) => resolve({ data: { released_sd: 'X' }, error: null }) }) };
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'manual', silent);
    expect(r.released).toBe(true);
    expect(r.error).toBeNull();
  });

  it('resolves {released:false} (no throw) when the rpc REJECTS', async () => {
    const supabase = { rpc: vi.fn(async () => { throw new Error('db down'); }) };
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'manual', silent);
    expect(r.released).toBe(false);
    expect(r.error).toMatch(/db down/);
  });

  it('resolves {released:false} (no throw) when the rpc returns an {error}', async () => {
    const supabase = { rpc: async () => ({ data: null, error: { message: 'rls denied' } }) };
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'manual', silent);
    expect(r.released).toBe(false);
    expect(r.error).toMatch(/rls denied/);
  });

  it('resolves {released:false, error:no_supabase} when supabase is missing (no throw)', async () => {
    expect(await bestEffortReleaseSd(null, 's', 'manual', silent)).toEqual({ released: false, error: 'no_supabase' });
    expect(await bestEffortReleaseSd({}, 's', 'manual', silent)).toEqual({ released: false, error: 'no_supabase' });
  });

  it('passes the session id + reason to release_sd', async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    await bestEffortReleaseSd({ rpc }, 'sess-9', 'unfit_repo_mismatch', silent);
    expect(rpc).toHaveBeenCalledWith('release_sd', { p_session_id: 'sess-9', p_reason: 'unfit_repo_mismatch' });
  });

  // SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (FR-3): both known release_sd SQL bodies always
  // return success:true today, so this is presently unreachable in production — but the
  // check must exist so a future RPC contract change cannot silently read as a release
  // that happened.
  it('FR-3: resolves {released:false} when the RPC data explicitly reports success:false', async () => {
    const supabase = { rpc: async () => ({ data: { success: false }, error: null }) };
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'manual', silent);
    expect(r.released).toBe(false);
    expect(r.error).toBe('release_sd_reported_failure');
  });

  it('FR-3: prefers data.message over data.error on success:false (mirrors claim-swapper.js swapClaim\'s precedent)', async () => {
    const supabase = {
      rpc: async () => ({ data: { success: false, error: 'terse_code', message: 'human-readable reason' }, error: null }),
    };
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'manual', silent);
    expect(r.error).toBe('human-readable reason');
  });

  it('FR-3: falls back to data.error when success:false carries no message', async () => {
    const supabase = { rpc: async () => ({ data: { success: false, error: 'terse_code' }, error: null }) };
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'manual', silent);
    expect(r.error).toBe('terse_code');
  });

  it('FR-3: does not misfire on a normal success response (no explicit success:false)', async () => {
    const supabase = { rpc: async () => ({ data: { released_sd: 'X' }, error: null }) };
    const r = await bestEffortReleaseSd(supabase, 'sess-1', 'manual', silent);
    expect(r.released).toBe(true);
  });
});
