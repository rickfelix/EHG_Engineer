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

const { resolveAdamReplyTarget, retargetStaleAdamInbound, verifyReplyDelivered } = adamIdentity;

// Minimal chainable supabase mock. claude_sessions reads return `freshAdams`; session_coordination
// UPDATE...select('id') returns `retargetRows`; maybeSingle returns `verifyRow`.
function makeSb({ freshAdams = [], retargetRows = [], retargetError = null, verifyRow = null } = {}) {
  const calls = { updates: [] };
  const sb = {
    _calls: calls,
    from(table) {
      let isUpdate = false;
      const builder = {
        select() { return builder; },
        gte() { return builder; },
        filter() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        // FR-6 (count-truncation discipline): fetchFreshAdams paginates via fetchAllPaginated,
        // whose pages end in .order(...).range(from, to) — slice so the short-page loop exits.
        order() { return builder; },
        range(from, to) {
          const rows = table === 'claude_sessions' ? freshAdams : [];
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
        update(patch) { isUpdate = true; calls.updates.push({ table, patch }); return builder; },
        maybeSingle() { return Promise.resolve({ data: verifyRow, error: null }); },
        then(resolve, reject) {
          let result;
          if (table === 'claude_sessions') result = { data: freshAdams, error: null };
          else if (table === 'session_coordination') result = isUpdate ? { data: retargetRows, error: retargetError } : { data: [], error: null };
          else result = { data: [], error: null };
          return Promise.resolve(result).then(resolve, reject);
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

describe('FR-2 retargetStaleAdamInbound — recover stuck unread inbound', () => {
  it('recovers unread coordinator rows from the stale originator and reports the count', async () => {
    const sb = makeSb({ retargetRows: [{ id: 'm1' }, { id: 'm2' }] });
    const r = await retargetStaleAdamInbound(sb, { staleOriginator: 'stale', liveAdam: 'live' });
    expect(r.retargeted).toBe(2);
    expect(r.error).toBe(null);
  });

  it('is a no-op when originator === live Adam (nothing to recover)', async () => {
    const sb = makeSb({ retargetRows: [{ id: 'm1' }] });
    const r = await retargetStaleAdamInbound(sb, { staleOriginator: 'x', liveAdam: 'x' });
    expect(r.retargeted).toBe(0);
  });

  it('surfaces a recovery error (never silent)', async () => {
    const sb = makeSb({ retargetError: { message: 'db down' } });
    const r = await retargetStaleAdamInbound(sb, { staleOriginator: 'stale', liveAdam: 'live' });
    expect(r.retargeted).toBe(0);
    expect(r.error).toBe('db down');
  });

  // SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-3: regression pin, not a fix — one
  // of the 4 already-correct re-target paths RISK identified.
  it('(FR-3 pin) the update patch is ONLY {target_session} — never sender_session/created_at', async () => {
    const sb = makeSb({ retargetRows: [{ id: 'm1' }] });
    await retargetStaleAdamInbound(sb, { staleOriginator: 'stale', liveAdam: 'live' });
    const patch = sb._calls.updates[0].patch;
    expect(patch).toEqual({ target_session: 'live' });
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
