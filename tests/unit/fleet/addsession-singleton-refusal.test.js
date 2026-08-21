// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-4 — route-level singleton refusal.
// SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 / FR-1 — the resolver swap that reaches a STALE holder.

import { describe, it, expect, vi } from 'vitest';
import { resolveSingletonSpawnVerdict, defaultResolveHolderId } from '../../../server/routes/fleet-actions.js';
import { getActiveAdamId } from '../../../lib/coordinator/adam-identity.cjs';

function sbWith(row) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) })),
      })),
    })),
  };
}

/**
 * FR-1: a chainable double that GENUINELY HONORS both `.gte('heartbeat_at', cutoff)` and
 * `.filter('metadata->>role', 'eq', role)` — tracking whether each was invoked and, if so, ACTUALLY
 * filtering rows, rather than a passthrough double that would make a pre-fix-vs-post-fix comparison
 * (or a cross-role contamination) vacuous (PLAN-phase TESTING finding C-1; role-filter passthrough
 * gap raised by EXEC-phase TESTING). Supports BOTH query shapes exercised by this test suite: the
 * paginated election query (select/gte?/filter/order/range, used by fetchAllAdamsStrict +
 * fetchFreshAdams) and resolveSingletonSpawnVerdict's own single-row fetch (select/eq/maybeSingle).
 */
function honoringSb({ rows = [], holderRows = {} } = {}) {
  return {
    from() {
      let gteCutoff = null;
      let roleFilter = null;
      const builder = {
        select() { return builder; },
        filter(col, op, val) { if (col === 'metadata->>role') roleFilter = val; return builder; },
        gte(col, val) { if (col === 'heartbeat_at') gteCutoff = val; return builder; },
        order() { return builder; },
        eq(col, val) {
          return { maybeSingle: () => Promise.resolve({ data: holderRows[val] || null, error: null }) };
        },
        range(from, to) {
          let filtered = gteCutoff ? rows.filter((r) => r.heartbeat_at && r.heartbeat_at >= gteCutoff) : rows;
          if (roleFilter) filtered = filtered.filter((r) => r.metadata && r.metadata.role === roleFilter);
          return Promise.resolve({ data: filtered.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  };
}

const staleAdamRow = {
  session_id: 'stale-adam-1',
  heartbeat_at: new Date(Date.now() - 30 * 60_000).toISOString(), // 30 min old: past the 600s guard, inside the 3600s panel window
  metadata: { role: 'adam', adam_since: '2026-06-01T00:00:00.000Z' },
};

describe('FR-1: the route-local resolver reaches a stale-but-present holder', () => {
  it('defaultResolveHolderId finds the STALE Adam (unfiltered lookup) — proven against a double that genuinely honors .gte()', async () => {
    const sb = honoringSb({ rows: [staleAdamRow] });
    const holderId = await defaultResolveHolderId(sb, 'adam');
    expect(holderId).toBe('stale-adam-1');
  });

  it('REGRESSION CONTROL: the SAME stale-only row set, through the SHARED getActiveAdamId, still resolves to null — proving the swap is route-local and did not widen the shared resolver', async () => {
    // This is the "fails against the current .gte(now-600s) filtered resolver" half of AC-2, made
    // falsifiable: getActiveAdamId (adam-identity.cjs, untouched by this FR) still correctly excludes
    // a stale-only holder via the SAME honoring double.
    const sb = honoringSb({ rows: [staleAdamRow] });
    const id = await getActiveAdamId(sb, {});
    expect(id).toBeNull();
  });

  it('end-to-end: resolveSingletonSpawnVerdict (using the REAL defaultResolveHolderId, no injection) surfaces the amber "Replace the stale Adam" verdict for a genuinely stale holder', async () => {
    const sb = honoringSb({ rows: [staleAdamRow], holderRows: { 'stale-adam-1': staleAdamRow } });
    const v = await resolveSingletonSpawnVerdict(sb, 'adam'); // no deps override -- defaultResolveHolderId runs for real
    expect(v.allowed).toBe(true);
    expect(v.uiEnabled).toBe(true);
    expect(v.uiLabel).toBe('Replace the stale Adam');
    expect(v.holderIsFresh).toBe(false);
  });

  it('a FRESH Adam is still refused end-to-end (the common case is unaffected by the swap)', async () => {
    const freshRow = { ...staleAdamRow, session_id: 'fresh-adam-1', heartbeat_at: new Date().toISOString() };
    const sb = honoringSb({ rows: [freshRow], holderRows: { 'fresh-adam-1': freshRow } });
    const v = await resolveSingletonSpawnVerdict(sb, 'adam');
    expect(v.allowed).toBe(false);
    expect(v.httpStatus).toBe(400);
    expect(v.uiEnabled).toBe(false);
    expect(v.uiLabel).toBe('Adam is live');
  });

  it('NEGATIVE CONTROL: the role filter is genuinely applied, not a passthrough -- a live Solomon does not resolve as Adam\'s holder', async () => {
    // Without a genuinely-filtering double, a query bug that dropped the role filter entirely
    // (returning every claude_sessions row regardless of role) would pass every other test in this
    // file identically -- rows is single-role by construction elsewhere. This seeds BOTH roles.
    const freshAdam = { ...staleAdamRow, session_id: 'fresh-adam-x', heartbeat_at: new Date().toISOString(), metadata: { role: 'adam' } };
    const freshSolomon = { session_id: 'fresh-solomon-y', heartbeat_at: new Date().toISOString(), metadata: { role: 'solomon' } };
    const sb = honoringSb({ rows: [freshSolomon], holderRows: {} }); // Adam query sees ONLY the solomon row if filtering is broken
    const holderId = await defaultResolveHolderId(sb, 'adam');
    expect(holderId).toBeNull(); // no adam-role row exists once genuinely filtered

    const sbBothRoles = honoringSb({ rows: [freshAdam, freshSolomon], holderRows: {} });
    const adamHolder = await defaultResolveHolderId(sbBothRoles, 'adam');
    expect(adamHolder).toBe('fresh-adam-x'); // never the solomon row, even though both are present
  });
});

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
