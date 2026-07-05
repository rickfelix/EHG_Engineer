/**
 * QF-20260705-914: the sweep's completion nudge ("Next work available when X completes")
 * stamped target_sd = the worker's CURRENT sd_key and named that key in body/payload.current_sd.
 * worker-checkin's step-5 assignment-claim path picked the row up as a directed assignment
 * (extractSdFromAssignment's broad fallbacks) — so a worker that RELEASED its QF (e.g. a
 * not_before defer, specimen QF-20260704-348) re-claimed it on the very next checkin, and the
 * sweep spam-guard (no unacked WA -> fresh nudge) made the release->reclaim loop perpetual
 * (live-confirmed: 2 cycles in 90s, 2026-07-05 09:07Z).
 *
 * Fix under test, both seams:
 *  - SENDER (stale-session-sweep.cjs dispatchWorkAssignmentsIfAllowed): nudge rows carry
 *    target_sd:null + payload.kind='completion_nudge' + informational:true; current_sd stays
 *    payload-only context.
 *  - CONSUMER (worker-checkin.cjs step 5): isInformationalNudge() rows never become the
 *    claimable `assignment` — including OLD-shape rows (no kind marker) via the sweep's
 *    subject literal, so rows already in the recency window go inert on deploy.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveCheckin, isInformationalNudge } = require('../../scripts/worker-checkin.cjs');
const { dispatchWorkAssignmentsIfAllowed } = require('../../scripts/stale-session-sweep.cjs');

const RELEASED_QF = 'QF-20260704-348';

describe('sender seam — dispatchWorkAssignmentsIfAllowed emits an informational, non-directed nudge', () => {
  function fakeSweepSb({ inserted }) {
    return {
      from(table) {
        const api = {
          select() { return this; }, eq() { return this; }, is() { return this; },
          limit() { return Promise.resolve({ data: [], error: null }); }, // spam-guard: no unacked WA
          maybeSingle() {
            // assertSdDispatchable resolves payload.current_sd -> quick_fixes status lookup
            if (table === 'quick_fixes') return Promise.resolve({ data: { status: 'in_progress' }, error: null });
            return Promise.resolve({ data: null, error: null });
          },
          insert(row) { inserted.push(row); return Promise.resolve({ error: null }); },
        };
        return api;
      },
    };
  }

  it('nudge row has target_sd:null, kind completion_nudge, informational:true, current_sd payload-only', async () => {
    const inserted = [];
    const res = await dispatchWorkAssignmentsIfAllowed(
      fakeSweepSb({ inserted }),
      [{ session_id: 'sess-1', sd_key: RELEASED_QF }],
      ['SD-AVAIL-001'],
      true
    );
    expect(res.dispatched).toBe(1);
    expect(inserted).toHaveLength(1);
    const row = inserted[0];
    expect(row.target_sd).toBeNull();
    expect(row.payload.kind).toBe('completion_nudge');
    expect(row.payload.informational).toBe(true);
    expect(row.payload.current_sd).toBe(RELEASED_QF);
    expect(isInformationalNudge(row)).toBe(true); // the consumer predicate recognizes the sender's shape
  });

  it('still respects the single-writer gate (no insert when not canonical)', async () => {
    const inserted = [];
    const res = await dispatchWorkAssignmentsIfAllowed(
      fakeSweepSb({ inserted }),
      [{ session_id: 'sess-1', sd_key: RELEASED_QF }],
      [],
      false
    );
    expect(res.blocked).toBe(true);
    expect(inserted).toHaveLength(0);
  });
});

describe('isInformationalNudge — recognizes new-shape and legacy-shape nudges', () => {
  it('new shape: payload.kind completion_nudge', () => {
    expect(isInformationalNudge({ payload: { kind: 'completion_nudge' } })).toBe(true);
  });
  it('legacy shape already in the recency window: sweep subject literal, no kind marker', () => {
    expect(isInformationalNudge({ subject: 'Next work available when 348 completes', payload: { available_sds: [], current_sd: RELEASED_QF } })).toBe(true);
  });
  it('a genuine directed assignment is NOT informational', () => {
    expect(isInformationalNudge({ subject: 'WORK ASSIGNMENT', payload: { qf_id: 'QF-20260704-726' } })).toBe(false);
    expect(isInformationalNudge({ payload: { assigned_sd: 'SD-X-001' } })).toBe(false);
  });
});

describe('consumer seam — resolveCheckin never claims off a completion nudge (the release->reclaim loop)', () => {
  function fakeSb({ rpcCalls }) {
    return {
      rpc(name, args) { rpcCalls.push({ name, args }); return Promise.resolve({ data: { success: true }, error: null }); },
      from(table) {
        const api = {
          select() { return this; }, eq() { return this; }, neq() { return this; },
          gte() { return this; }, lte() { return this; }, in() { return this; },
          is() { return this; }, or() { return this; }, not() { return this; },
          order() { return this; }, limit() { return this; },
          maybeSingle() {
            if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker' }, sd_key: null }, error: null });
            return Promise.resolve({ data: null, error: null });
          },
          insert() { return Promise.resolve({ error: null }); },
          update() { return { eq() { return Promise.resolve({ error: null }); } }; },
        };
        return api;
      },
    };
  }

  async function runWithNudge(sb, nudgeRow) {
    const ws = require('../../lib/fleet/worker-status.cjs');
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [nudgeRow];
    try {
      return await resolveCheckin(sb, 'sess-released-qf', { getCoordinator: async () => null });
    } finally {
      ws.getMessagesForSession = orig;
    }
  }

  it('new-shape nudge naming the just-released QF drives NO claim attempt', async () => {
    const rpcCalls = [];
    const res = await runWithNudge(fakeSb({ rpcCalls }), {
      id: 'msg-nudge-new', message_type: 'WORK_ASSIGNMENT',
      subject: 'Next work available when 348 completes',
      body: 'When you complete ' + RELEASED_QF + ', pick up the next unclaimed child.',
      payload: { available_sds: [], current_sd: RELEASED_QF, kind: 'completion_nudge', informational: true },
    });
    expect(res.action).not.toBe('claimed_assignment');
    expect(rpcCalls.filter(c => JSON.stringify(c.args || {}).includes(RELEASED_QF))).toHaveLength(0);
  });

  it('legacy-shape nudge (pre-fix row still unacked in the window) also drives NO claim attempt', async () => {
    const rpcCalls = [];
    const res = await runWithNudge(fakeSb({ rpcCalls }), {
      id: 'msg-nudge-old', message_type: 'WORK_ASSIGNMENT',
      subject: 'Next work available when 348 completes',
      body: 'When you complete ' + RELEASED_QF + ', pick up the next unclaimed child.',
      payload: { available_sds: [], current_sd: RELEASED_QF },
    });
    expect(res.action).not.toBe('claimed_assignment');
    expect(rpcCalls.filter(c => JSON.stringify(c.args || {}).includes(RELEASED_QF))).toHaveLength(0);
  });

  it('regression: a genuine directed qf_id assignment still claims', async () => {
    const rpcCalls = [];
    const res = await runWithNudge(fakeSb({ rpcCalls }), {
      id: 'msg-directed', message_type: 'WORK_ASSIGNMENT',
      subject: 'WORK ASSIGNMENT',
      payload: { qf_id: 'QF-20260704-726' },
    });
    expect(res.action).toBe('claimed_assignment');
    expect(res.sd).toBe('QF-20260704-726');
  });
});
