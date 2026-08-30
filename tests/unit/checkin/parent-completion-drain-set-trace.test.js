/**
 * QF-20260830-280 — TRACE, not read: role_drain_sets (role='worker') never listed
 * 'parent_completion', yet lib/checkin/steps/directed-assignment.cjs:230's
 * orchestrator-parent exception depends on receiving exactly that kind. This test
 * exercises the REAL getMessagesForSession implementation (not a mock of the whole
 * function, only its sb client) against a fixture row carrying
 * payload.kind='parent_completion', proving definitively whether the read path
 * consults any kind/drain-set filter before returning it to the caller that feeds
 * directed-assignment.cjs's pickClaimable.
 *
 * OUTCOME (pasted per the QF's own instruction): the row IS returned unfiltered.
 * getMessagesForSession's query is scoped purely by target_session (+ optional
 * sinceIso/unreadOnly/unackedOnly/excludeExpired) — it has no kind/drain-set
 * awareness at all. role_drain_sets / DRAIN_SETS is consulted ONLY at SEND time
 * (lib/coordinator/dispatch.cjs's warnIfUndrainedKindViaRegistry), never here. So
 * the coordinator's WARN was correct that the kind was unregistered, but the
 * delivery itself was never actually at risk on THIS read path — the fix is to
 * register the kind (closing the false-positive warn), not to re-key the
 * orchestrator-parent exception.
 */
import { describe, it, expect, vi } from 'vitest';

const ws = require('../../../lib/fleet/worker-status.cjs');

function stubWithRows(rows) {
  // getMessagesForSession chains .order() BEFORE any optional .gte()/.is() calls (unlike the
  // worker-status-expiry-filter.test.js reference stub, which never exercises unackedOnly),
  // so every method here must return the same thenable chain, not resolve early.
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return { from: vi.fn(() => chain) };
}

describe('QF-20260830-280: parent_completion is read/picked despite the drain-set gap', () => {
  it('getMessagesForSession returns a payload.kind=parent_completion WORK_ASSIGNMENT row unfiltered', async () => {
    const row = {
      id: 'fixture-parent-completion-row',
      message_type: 'WORK_ASSIGNMENT',
      payload: { kind: 'parent_completion', sd_key: 'SD-FIXTURE-PARENT-001' },
      created_at: new Date().toISOString(),
    };
    const sb = stubWithRows([row]);
    const out = await ws.getMessagesForSession(sb, 'fixture-worker-session', { unackedOnly: true });
    // No kind/role/drain-set filter exists in this read path — the row that dispatch.cjs's
    // send-time warn flagged as "may orphan at the target" reaches the caller intact.
    expect(out).toHaveLength(1);
    expect(out[0].payload.kind).toBe('parent_completion');
  });

  it('DRAIN_SETS.worker (the fallback SSOT the registry falls back to on any DB failure) recognizes parent_completion', () => {
    // The registry (lib/fleet/drain-set-registry.js) falls back to this exact hard-coded
    // constant on ANY query error / missing table / null supabase. Registering the kind only
    // in the DB table without also updating this fallback would leave the warn spuriously
    // firing again the moment the registry read degrades.
    expect(ws.DRAIN_SETS.worker).toContain('parent_completion');
  });
});
