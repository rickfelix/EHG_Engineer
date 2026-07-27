/**
 * QF-20260727-088 — belt-and-braces half of QF-20260727-205.
 *
 * Promoting a session to coordinator must leave no stale `metadata.fleet_identity` behind, so the
 * contradictory pair (worker callsign + is_coordinator) cannot persist. QF-205 shipped the panel-side
 * branch-order fix; this pins the write-side cleanup.
 *
 * Pinned behavior:
 *   - FLAG-ON  (atomic set_coordinator_flag RPC): a separate metadata UPDATE strips fleet_identity,
 *     issued AFTER registration so the FR-1 register-before-retire ordering contract is untouched.
 *   - FLAG-OFF (legacy read-merge-write upsert): the same key is dropped inside the upsert payload,
 *     with no extra round trip and no change to the legacy pointer-first ordering.
 *   - Sibling metadata keys survive on BOTH paths.
 *   - When there is NO stale stamp, NO metadata write is issued at all (keeps the lost-update
 *     window closed on the common promotion).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { setActiveCoordinator, clearFleetIdentityFromSession } = req('../../lib/coordinator/resolve.cjs');

// Mirrors tests/unit/coordinator-flag-rpc-fallback.test.js, plus an ordered `seq` log and
// order/range so the Step-3 incumbent snapshot resolves to [] instead of throwing.
function makeSupabase({ sessionRow = null, rpcImpl } = {}) {
  const calls = { rpc: [], upserts: [], updates: [], seq: [] };
  const defaultRpc = (name) => {
    // exec_sql backs the pg_proc canary; an empty result just makes it warn (behavior-neutral).
    if (name === 'exec_sql') return { data: [{ result: [] }], error: null };
    return { error: null };
  };
  const impl = rpcImpl || defaultRpc;
  const supabase = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      calls.seq.push(`rpc:${name}`);
      return impl(name, args);
    },
    from(table) {
      const builder = {
        update: (patch) => {
          calls.updates.push({ table, patch });
          if (patch && patch.metadata) calls.seq.push('update:metadata');
          return builder;
        },
        select: () => builder,
        eq: () => builder,
        gte: async () => ({ data: [], error: null }),
        filter: () => builder,
        order: () => builder,
        range: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: sessionRow, error: null }),
        upsert: (payload) => {
          calls.upserts.push({ table, payload });
          calls.seq.push('upsert:metadata');
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    },
    _calls: calls,
  };
  return supabase;
}

const STALE = {
  fleet_identity: { callsign: 'Alpha', assigned_at: '2026-07-27T10:01:31Z' },
  model: 'opus',
};

// The metadata writes that carry a full metadata object (the drain's target_session update does not).
const metadataUpdates = (sb) => sb._calls.updates.filter(u => u.patch && u.patch.metadata);

describe('QF-20260727-088 FLAG-ON: promotion clears a stale fleet_identity', () => {
  const PREV = process.env.COORDINATOR_TWOWAY_V2;
  beforeEach(() => { process.env.COORDINATOR_TWOWAY_V2 = 'on'; });
  afterEach(() => { process.env.COORDINATOR_TWOWAY_V2 = PREV; });

  it('strips fleet_identity while preserving sibling keys', async () => {
    const sb = makeSupabase({ sessionRow: { metadata: { ...STALE } } });
    await setActiveCoordinator(sb, 'sess-flag-on');

    const writes = metadataUpdates(sb);
    expect(writes).toHaveLength(1);
    expect(writes[0].patch.metadata.fleet_identity).toBeUndefined();
    expect(writes[0].patch.metadata.model).toBe('opus'); // siblings survive
  });

  it('clears AFTER registering, so register-before-retire ordering is untouched', async () => {
    const sb = makeSupabase({ sessionRow: { metadata: { ...STALE } } });
    await setActiveCoordinator(sb, 'sess-order');

    const { seq } = sb._calls;
    const registeredAt = seq.indexOf('rpc:set_coordinator_flag');
    const clearedAt = seq.indexOf('update:metadata');
    expect(registeredAt).toBeGreaterThanOrEqual(0);
    expect(clearedAt).toBeGreaterThan(registeredAt);
  });

  it('issues NO metadata write when there is no stale stamp', async () => {
    const sb = makeSupabase({ sessionRow: { metadata: { model: 'opus' } } });
    await setActiveCoordinator(sb, 'sess-clean');
    expect(metadataUpdates(sb)).toHaveLength(0);
  });

});

// Fail-open is asserted against the helper directly. Killing supabase.from() wholesale would
// instead trip the (pre-existing, unguarded) broadcast-drain step earlier in setActiveCoordinator,
// which would test that step rather than this one.
describe('QF-20260727-088 clearFleetIdentityFromSession is fail-open', () => {
  it('resolves when the read/update throws', async () => {
    const exploding = { from: () => { throw new Error('DB down'); } };
    await expect(clearFleetIdentityFromSession(exploding, 'sess-x')).resolves.toBeUndefined();
  });

  it('resolves when the UPDATE returns an error', async () => {
    const sb = makeSupabase({ sessionRow: { metadata: { ...STALE } } });
    sb.from = () => ({
      select: () => sb.from(),
      eq: () => sb.from(),
      maybeSingle: async () => ({ data: { metadata: { ...STALE } }, error: null }),
      update: () => ({ eq: async () => ({ error: { message: 'write rejected' } }) }),
    });
    await expect(clearFleetIdentityFromSession(sb, 'sess-y')).resolves.toBeUndefined();
  });

  it('no-ops on a missing supabase client or session id', async () => {
    await expect(clearFleetIdentityFromSession(null, 'sess-z')).resolves.toBeUndefined();
    await expect(clearFleetIdentityFromSession(makeSupabase(), '')).resolves.toBeUndefined();
  });
});

describe('QF-20260727-088 FLAG-OFF: legacy upsert drops fleet_identity', () => {
  const PREV = process.env.COORDINATOR_TWOWAY_V2;
  beforeEach(() => { process.env.COORDINATOR_TWOWAY_V2 = 'off'; });
  afterEach(() => { process.env.COORDINATOR_TWOWAY_V2 = PREV; });

  it('upserts is_coordinator without the stale callsign, keeping siblings', async () => {
    const sb = makeSupabase({ sessionRow: { metadata: { ...STALE } } });
    await setActiveCoordinator(sb, 'sess-flag-off');

    const upsert = sb._calls.upserts.find(u => u.payload?.metadata?.is_coordinator === true);
    expect(upsert).toBeTruthy();
    expect(upsert.payload.metadata.fleet_identity).toBeUndefined();
    expect(upsert.payload.metadata.model).toBe('opus');
  });
});
