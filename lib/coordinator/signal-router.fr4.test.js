// Tests for SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-4
// signal-router.cjs ackAndRouteLoneSignal — ROUTE != PROMOTE.
//
// Asserts: (a) the 9-cell severity×callsign matrix, (b) shouldPromote() UNCHANGED,
// (c) lone-medium ack+route does NOT call insertFeedbackRow (no harness_backlog row).

import { describe, it, expect } from 'vitest';
import {
  shouldPromote,
  shouldRouteLone,
  groupByFingerprint,
  ackAndRouteLoneSignal,
  ROUTE_MIN_SEVERITY
} from './signal-router.cjs';

// Build a fingerprint group with `n` distinct callsigns at a given severity.
// (groupByFingerprint dedups by sender_callsign, so distinct names → distinct count.)
function group(severity, callsignCount) {
  const names = ['A', 'B', 'C', 'D'].slice(0, callsignCount);
  const rows = names.map((cs, i) => ({
    id: 'r' + i,
    sender_session: 's' + i,
    body: 'same body',
    payload: { signal_type: 'stuck', sender_callsign: cs, severity },
    created_at: '2026-06-04T00:0' + i + ':00Z'
  }));
  return Array.from(groupByFingerprint(rows).values())[0];
}

describe('FR-4 matrix: shouldRouteLone across severity{low,medium,high,critical} × callsigns{1,2,3}', () => {
  // Expected lone-route TRUE only for medium/high with < 3 callsigns.
  // low: never lone (needs 3 → but 3 is an aggregate/promote, not lone).
  // critical: never lone (always promotes — critical bypass).
  // callsigns>=3: never lone (aggregate → promote).
  const expectations = [
    // severity,   callsigns, routeLone, promote
    ['low',        1, false, false],
    ['low',        2, false, false],
    ['low',        3, false, true],   // 3 callsigns → aggregate promote (not lone)
    ['medium',     1, true,  false],  // lone medium → ack+route TRUE
    ['medium',     2, true,  false],
    ['medium',     3, false, true],   // callsigns>=3 → aggregate
    ['high',       1, true,  false],  // lone high → ack+route TRUE
    ['high',       2, true,  false],
    ['high',       3, false, true],   // callsigns>=3 → aggregate
    ['critical',   1, false, true],   // critical bypass → promote (not lone)
    ['critical',   2, false, true],
    ['critical',   3, false, true],
  ];

  for (const [severity, callsigns, expRoute, expPromote] of expectations) {
    it(`${severity} × ${callsigns} callsign(s) → routeLone=${expRoute}, promote=${expPromote}`, () => {
      const g = group(severity, callsigns);
      expect(shouldRouteLone(g)).toBe(expRoute);
      expect(shouldPromote(g)).toBe(expPromote);
      // route and promote are mutually exclusive by construction.
      expect(shouldRouteLone(g) && shouldPromote(g)).toBe(false);
    });
  }

  it('ROUTE_MIN_SEVERITY is medium', () => {
    expect(ROUTE_MIN_SEVERITY).toBe('medium');
  });
});

describe('FR-4: shouldPromote() is UNCHANGED (SR-18 "2 medium -> skipped" still holds)', () => {
  it('2 distinct medium callsigns do not promote', () => {
    expect(shouldPromote({ callsigns: new Set(['A', 'B']), max_severity: 'medium' })).toBe(false);
  });
  it('3 distinct callsigns promote', () => {
    expect(shouldPromote({ callsigns: new Set(['A', 'B', 'C']), max_severity: 'medium' })).toBe(true);
  });
  it('single critical promotes', () => {
    expect(shouldPromote({ callsigns: new Set(['A']), max_severity: 'critical' })).toBe(true);
  });
});

describe('FR-4: ackAndRouteLoneSignal e2e — acks+routes lone medium WITHOUT insertFeedbackRow', () => {
  function makeClient(rows) {
    const updates = [];
    let feedbackInsertCalled = false;
    const client = {
      from: (table) => {
        if (table === 'session_coordination') {
          return {
            select: () => ({
              gte: () => ({
                not: () => Promise.resolve({ data: rows, error: null })
              })
            }),
            update: (patch) => ({
              eq: (col, val) => { updates.push({ patch, col, val }); return Promise.resolve({ data: null, error: null }); }
            })
          };
        }
        if (table === 'feedback') {
          return {
            // If FR-4 ever calls feedback insert/select, flip the flag (test should fail).
            select: () => { feedbackInsertCalled = true; return { eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }; },
            insert: () => { feedbackInsertCalled = true; return { select: () => ({ single: () => Promise.resolve({ data: { id: 'x' }, error: null }) }) }; }
          };
        }
        return {};
      }
    };
    return { client, updates, getFeedbackCalled: () => feedbackInsertCalled };
  }

  it('lone medium (single callsign) → routed=1, acknowledged_at stamped, NO feedback insert', async () => {
    const rows = [
      { id: 'r1', sender_session: 's1', acknowledged_at: null, body: 'pipeline hiccup', payload: { signal_type: 'stuck', sender_callsign: 'Solo', severity: 'medium' }, created_at: '2026-06-04T00:00:00Z' }
    ];
    const { client, updates, getFeedbackCalled } = makeClient(rows);

    const res = await ackAndRouteLoneSignal(client);

    expect(res.routed).toBe(1);
    expect(res.routedGroups.length).toBe(1);
    expect(res.routedGroups[0].severity).toBe('medium');
    // acknowledged_at + routed_to_coordinator stamped on the lone signal.
    const u = updates.find(x => x.val === 'r1');
    expect(u).toBeTruthy();
    expect(u.patch.acknowledged_at).toBeTruthy();
    expect(u.patch.payload.routed_to_coordinator).toBe(true);
    // route != promote — NO harness_backlog row.
    expect(getFeedbackCalled()).toBe(false);
  });

  it('already-acknowledged lone signal is skipped (idempotent — no re-route)', async () => {
    const rows = [
      { id: 'r1', sender_session: 's1', acknowledged_at: '2026-06-04T00:00:00Z', body: 'x', payload: { signal_type: 'stuck', sender_callsign: 'Solo', severity: 'high', routed_to_coordinator: true }, created_at: '2026-06-04T00:00:00Z' }
    ];
    const { client, getFeedbackCalled } = makeClient(rows);
    const res = await ackAndRouteLoneSignal(client);
    expect(res.routed).toBe(0);
    expect(res.skipped).toBe(1);
    expect(getFeedbackCalled()).toBe(false);
  });

  it('low single-callsign signal is NOT routed (below medium threshold)', async () => {
    const rows = [
      { id: 'r1', sender_session: 's1', acknowledged_at: null, body: 'minor', payload: { signal_type: 'stuck', sender_callsign: 'Solo', severity: 'low' }, created_at: '2026-06-04T00:00:00Z' }
    ];
    const { client } = makeClient(rows);
    const res = await ackAndRouteLoneSignal(client);
    expect(res.routed).toBe(0);
  });

  it('3-callsign group is NOT lone-routed (that is the promote path)', async () => {
    const rows = ['A', 'B', 'C'].map((cs, i) => ({
      id: 'r' + i, sender_session: 's' + i, acknowledged_at: null, body: 'agg',
      payload: { signal_type: 'stuck', sender_callsign: cs, severity: 'medium' }, created_at: '2026-06-04T00:0' + i + ':00Z'
    }));
    const { client } = makeClient(rows);
    const res = await ackAndRouteLoneSignal(client);
    expect(res.routed).toBe(0);
    expect(res.skipped).toBe(1);
  });
});
