// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-4 — route-level singleton refusal.

import { describe, it, expect, vi } from 'vitest';
import { resolveSingletonSpawnVerdict } from '../../../server/routes/fleet-actions.js';

function sbWith(row) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) })),
      })),
    })),
  };
}

describe('FR4-ROUTE: the refusal is computed by the SHARED decision, not re-derived', () => {
  it('a non-singleton role is allowed without touching any resolver', async () => {
    const decide = vi.fn(() => ({ allowed: true, httpStatus: 200, reason: null }));
    const v = await resolveSingletonSpawnVerdict(sbWith(null), 'worker', { decide });
    expect(v.allowed).toBe(true);
    expect(decide).toHaveBeenCalledWith({ role: 'worker', holder: null });
  });

  it('passes the holder to the shared decision with a GUARD-window age', async () => {
    // The route contributes identity + freshness; the VERDICT is the shared function's.
    const decide = vi.fn(() => ({ allowed: false, httpStatus: 400, reason: 'stub' }));
    const row = { session_id: 'holder-1', heartbeat_at: new Date().toISOString(), metadata: { role: 'adam' } };
    await resolveSingletonSpawnVerdict(sbWith(row), 'adam', { decide, resolveHolderId: async () => 'holder-1' });
    const arg = decide.mock.calls[0][0];
    expect(arg.role).toBe('adam');
    expect(arg.holder.session_id).toBe('holder-1');
    expect(arg.holder.identity_kind).toBe('adam');
    expect(arg.holder.heartbeat_age_ms).toBeLessThan(10_000);
  });

  it('treats a holder row that cannot be read as NO holder rather than inventing a refusal', async () => {
    const decide = vi.fn(() => ({ allowed: true, httpStatus: 200, reason: null }));
    await resolveSingletonSpawnVerdict(sbWith(null), 'adam', { decide, resolveHolderId: async () => 'holder-1' });
    expect(decide).toHaveBeenCalledWith({ role: 'adam', holder: null });
  });

  it('FAILS OPEN — a throwing resolver never manufactures a 400', async () => {
    // spawn()'s own dedup is the backstop and answers honestly (skipped:already_live). A route
    // that refused on its own infrastructure failure would block legitimate spawns.
    const exploding = { from: () => { throw new Error('db down'); } };
    const v = await resolveSingletonSpawnVerdict(exploding, 'adam', { resolveHolderId: async () => { throw new Error('resolver down'); } });
    expect(v.allowed).toBe(true);
    expect(v.httpStatus).toBe(200);
  });
});
