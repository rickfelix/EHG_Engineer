/**
 * SD-LEO-INFRA-COORD-ADAM-COMMS-DELIVERY-INTEGRITY-001 — coordinator->Adam reply delivery integrity.
 *
 * CONFIRMED root cause: the reply path targeted the advisory's ORIGINATING session
 * (adv.sender_session) directly, so after a role-handoff / single-Adam guard retire-then-register the
 * reply landed in the STALE Adam's inbox (coordinator believes-sent, live Adam inbox empty). These
 * tests lock the three fixes: FR-1 resolveAdamReplyTarget (live Adam, fail-open fallback), FR-2
 * retargetStaleAdamInbound (recover unread stuck rows), FR-3 verifyReplyDelivered (fail-loud).
 */
import { describe, it, expect } from 'vitest';
import adamIdentity from '../../../lib/coordinator/adam-identity.cjs';
import { createFixtureSupabase } from '../../helpers/postgrest-fixture-store.js';

const { resolveAdamReplyTarget, retargetStaleAdamInbound, verifyReplyDelivered } = adamIdentity;

// Minimal chainable supabase mock. claude_sessions reads return `freshAdams` (the election query,
// unfiltered pagination) OR, when SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001's
// resolveRetiredAdamSeats issues its role-filtered query, the ids in `retiredSeats`.
// session_coordination is routed through the genuinely-filtering postgrest-fixture-store
// (retargetStaleAdamInbound now selects real rows, not a bulk-update patch) so `retargetRows`
// carries real row shape (target_session/acknowledged_at/payload/created_at), not just `{id}`.
// maybeSingle returns `verifyRow`.
function makeSb({ freshAdams = [], retiredSeats = [], retargetRows = [], retargetError = null, verifyRow = null } = {}) {
  const calls = { updates: [] };
  const seedRows = retargetRows.map((r) => ({ ...r }));
  if (verifyRow) seedRows.push({ ...verifyRow });
  const scFixture = createFixtureSupabase({ session_coordination: seedRows });
  const sb = {
    _calls: calls,
    table: (name) => scFixture.table(name),
    from(table) {
      if (table === 'session_coordination') {
        if (retargetError) scFixture.setError('session_coordination', retargetError.message);
        const inner = scFixture.from(table);
        const wrapped = Object.create(inner);
        wrapped.update = (patch) => { calls.updates.push({ table, patch }); return inner.update(patch); };
        return wrapped;
      }
      let roleFilter;
      const builder = {
        select() { return builder; },
        gte() { return builder; },
        filter() { return builder; },
        eq(col, val) { if (col === 'metadata->>role') roleFilter = val; return builder; },
        is() { return builder; },
        // QF/SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001 FR-1: fetchFreshAdams now applies
        // .in('status', [...]) -- this file doesn't test status filtering itself (that's
        // adam-singleton.test.js), so a passthrough keeps freshAdams fixtures authoritative.
        in() { return builder; },
        or() { return builder; }, // fetchFreshAdams now uses .or() (INFO, PR #7369) instead of .in()
        // FR-6 (count-truncation discipline): fetchFreshAdams / resolveRetiredAdamSeats paginate
        // via fetchAllPaginated, whose pages end in .order(...).range(from, to).
        order() { return builder; },
        range(from, to) {
          const rows = roleFilter !== undefined
            ? retiredSeats.map((id) => ({ session_id: id }))
            : freshAdams;
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
        maybeSingle() { return Promise.resolve({ data: verifyRow, error: null }); },
        then(resolve, reject) {
          return Promise.resolve({ data: freshAdams, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return sb;
}

const liveRow = (id, since = '2026-06-26T00:00:00.000Z') => ({ session_id: id, heartbeat_at: new Date().toISOString(), metadata: { role: 'adam', adam_since: since } });

describe('FR-1 resolveAdamReplyTarget — re-route to the live Adam', () => {
  it('re-routes a stale-originator reply to the CURRENT live Adam', async () => {
    const sb = makeSb({ freshAdams: [liveRow('live-adam')] });
    const r = await resolveAdamReplyTarget(sb, 'stale-originator');
    expect(r.target).toBe('live-adam');
    expect(r.retargeted).toBe(true);
    expect(r.live).toBe('live-adam');
  });

  it('re-route is a no-op when the originator IS the live Adam', async () => {
    const sb = makeSb({ freshAdams: [liveRow('same-adam')] });
    const r = await resolveAdamReplyTarget(sb, 'same-adam');
    expect(r.target).toBe('same-adam');
    expect(r.retargeted).toBe(false);
  });

  it('fails OPEN: with no live Adam it falls back to the originator (reply never blocked)', async () => {
    const sb = makeSb({ freshAdams: [] });
    const r = await resolveAdamReplyTarget(sb, 'stale-originator');
    expect(r.target).toBe('stale-originator');
    expect(r.live).toBe(null);
    expect(r.retargeted).toBe(false);
  });
});

const recent = (minAgo = 60) => new Date(Date.now() - minAgo * 60_000).toISOString();
const retargetRow = (id, overrides = {}) => ({
  id, target_session: 'stale', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recent(), ...overrides,
});

describe('FR-2 retargetStaleAdamInbound — recover stuck unread inbound', () => {
  it('recovers unread coordinator rows from the stale originator and reports the count', async () => {
    const sb = makeSb({ retiredSeats: ['stale'], retargetRows: [retargetRow('m1'), retargetRow('m2')] });
    const r = await retargetStaleAdamInbound(sb, { staleOriginator: 'stale', liveAdam: 'live' });
    expect(r.retargeted).toBe(2);
    expect(r.error).toBe(null);
  });

  it('is a no-op when originator === live Adam (nothing to recover)', async () => {
    const sb = makeSb({ retiredSeats: ['x'], retargetRows: [retargetRow('m1', { target_session: 'x' })] });
    const r = await retargetStaleAdamInbound(sb, { staleOriginator: 'x', liveAdam: 'x' });
    expect(r.retargeted).toBe(0);
  });

  // SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001 (FR-4): staleOriginator must now be
  // independently VERIFIED as a retired seat — a plausible-looking originator that resolveRetiredAdamSeats
  // does not recognize moves nothing, even though rows exist and are otherwise eligible.
  it('an UNVERIFIED staleOriginator (not in the retired-seat set) moves 0 — the blast-radius regression', async () => {
    const sb = makeSb({ retiredSeats: [], retargetRows: [retargetRow('m1')] });
    const r = await retargetStaleAdamInbound(sb, { staleOriginator: 'stale', liveAdam: 'live' });
    expect(r.retargeted).toBe(0);
    expect(r.error).toBe(null);
  });

  it('surfaces a recovery error (never silent)', async () => {
    const sb = makeSb({ retiredSeats: ['stale'], retargetError: { message: 'db down' } });
    const r = await retargetStaleAdamInbound(sb, { staleOriginator: 'stale', liveAdam: 'live' });
    expect(r.retargeted).toBe(0);
    expect(r.error).toBe('db down');
  });

  // SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-3, updated by
  // SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001 (FR-4/AC-16): the patch now also stamps
  // payload.retargeted_from/retargeted_at (this mover previously carried no such breadcrumb) —
  // still never sender_session/created_at.
  it('(FR-3/AC-16 pin) the update patch is {target_session, payload} with retargeted_from/at stamped — never sender_session/created_at', async () => {
    const sb = makeSb({ retiredSeats: ['stale'], retargetRows: [retargetRow('m1')] });
    await retargetStaleAdamInbound(sb, { staleOriginator: 'stale', liveAdam: 'live' });
    const patch = sb._calls.updates[0].patch;
    expect(Object.keys(patch).sort()).toEqual(['payload', 'target_session']);
    expect(patch.target_session).toBe('live');
    expect(patch.payload.retargeted_from).toBe('stale');
    expect(patch.payload.retargeted_at).toBeTruthy();
  });
});

describe('FR-3 verifyReplyDelivered — fail-loud delivery verification', () => {
  it('confirms delivery when the inserted row reads back', async () => {
    const sb = makeSb({ verifyRow: { id: 'reply-1' } });
    expect(await verifyReplyDelivered(sb, 'reply-1')).toBe(true);
  });

  it('fail-loud signal: returns false when the row cannot be confirmed', async () => {
    const sb = makeSb({ verifyRow: null });
    expect(await verifyReplyDelivered(sb, 'reply-1')).toBe(false);
  });

  it('fail-loud signal: returns false for a missing row id', async () => {
    const sb = makeSb({ verifyRow: { id: 'x' } });
    expect(await verifyReplyDelivered(sb, null)).toBe(false);
  });
});
