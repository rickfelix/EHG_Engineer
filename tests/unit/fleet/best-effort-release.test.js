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
});
