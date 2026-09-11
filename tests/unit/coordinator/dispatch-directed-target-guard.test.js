/**
 * QF-20260907-463: insertCoordinationRow warns/refuses a WORK_ASSIGNMENT with no structured
 * directed target — sibling of dispatch-assignment-target-guard.test.js (that guard's broader
 * 'worker' profile), scoped to the narrower 'directed' profile extractDirectedSd actually uses.
 *
 * THE MEASURED GAP: a row can be worker-readable (text scan finds a key) yet still fail this
 * narrower check — that combination is exactly what let 58% of live WORK_ASSIGNMENT rows go
 * unclaimable on the fast/priority directed path while looking normal to the broader guard.
 *
 * Ships OBSERVE-ONLY per this file's own Observe-Only-First precedent (mirrors
 * isAssignmentTargetGuardBinding's rollout, but its OWN separate env var/switch) — pins both modes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const { insertCoordinationRow } = require_(path.join(REPO, 'lib/coordinator/dispatch.cjs'));

function stubSupabase() {
  const chain = {
    select: () => chain, eq: () => chain, in: () => chain, is: () => chain,
    order: () => chain, limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
  };
  return {
    from: () => ({
      ...chain,
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'row-1' }, error: null }) }) })
    }),
    rpc: async () => ({ data: null, error: null })
  };
}

const LIVE_TARGET = '11111111-2222-3333-4444-555555555555';

/** Worker-readable (text names a key) but directed-unresolvable (no structured field) — the
 *  exact measured gap this QF closes. */
function textOnlyRow(over = {}) {
  return {
    target_session: LIVE_TARGET,
    message_type: 'WORK_ASSIGNMENT',
    subject: 'Please pick up QF-20260726-459 next',
    body: 'named only in prose, no structured field',
    payload: {},
    ...over
  };
}

describe('QF-20260907-463 — directed-unresolvable WORK_ASSIGNMENT at the dispatch choke point', () => {
  let warn;
  beforeEach(() => { warn = vi.fn(); delete process.env.DISPATCH_DIRECTED_TARGET_GUARD; delete process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD; });
  afterEach(() => { delete process.env.DISPATCH_DIRECTED_TARGET_GUARD; delete process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD; vi.restoreAllMocks(); });

  it('OBSERVE-ONLY (default): warns with the directed-specific event name, does NOT throw', async () => {
    await insertCoordinationRow(stubSupabase(), textOnlyRow(), { logger: { warn } })
      .catch(() => {});
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('directed_target_unresolvable'));
    expect(line, 'expected an observe-only warning naming the directed-target event').toBeTruthy();
    expect(JSON.parse(line).mode).toBe('observe_only');
  });

  it('the BROADER unreadable-assignment guard does NOT fire for this same row — it IS worker-readable', async () => {
    await insertCoordinationRow(stubSupabase(), textOnlyRow(), { logger: { warn } }).catch(() => {});
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('assignment_target_unresolvable'));
    expect(line, 'a text-resolvable row must not ALSO trip the broader worker-profile guard').toBeFalsy();
  });

  it('BINDING (promoted via its OWN switch): throws DISPATCH_DIRECTED_TARGET_UNRESOLVABLE', async () => {
    process.env.DISPATCH_DIRECTED_TARGET_GUARD = 'block';
    await expect(insertCoordinationRow(stubSupabase(), textOnlyRow(), { logger: { warn } }))
      .rejects.toMatchObject({ code: 'DISPATCH_DIRECTED_TARGET_UNRESOLVABLE' });
  });

  it('promoting the OTHER (broader) guard does not bind this one — the two switches are independent', async () => {
    process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD = 'block';
    await insertCoordinationRow(stubSupabase(), textOnlyRow(), { logger: { warn } }).catch(() => {});
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('directed_target_unresolvable'));
    expect(line, 'directed guard should still be observe-only when only the OTHER switch is set').toBeTruthy();
  });

  it('a row carrying payload.sd_key is NOT flagged', async () => {
    await insertCoordinationRow(stubSupabase(), textOnlyRow({ payload: { sd_key: 'SD-LEO-ORCH-FOO-001-A' } }), { logger: { warn } })
      .catch(() => {});
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('directed_target_unresolvable'));
    expect(line).toBeFalsy();
  });

  it('an informational/broadcast completion nudge is exempt', async () => {
    await insertCoordinationRow(stubSupabase(), textOnlyRow({ payload: { kind: 'completion_nudge' } }), { logger: { warn } })
      .catch(() => {});
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('directed_target_unresolvable'));
    expect(line).toBeFalsy();
  });

  it('non-WORK_ASSIGNMENT rows are untouched by this guard', async () => {
    await insertCoordinationRow(stubSupabase(), textOnlyRow({ message_type: 'INFO', payload: { kind: 'note' } }), { logger: { warn } })
      .catch(() => {});
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('directed_target_unresolvable'));
    expect(line).toBeFalsy();
  });
});
