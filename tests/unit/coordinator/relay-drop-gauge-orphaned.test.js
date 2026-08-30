/**
 * SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 / FR-1, FR-2
 *
 * Counterparty-liveness discriminator for the relay-drop gauge: a commitment's
 * counterparty is ORPHANED when released_at is set, OR-ed with classifySeat()
 * returning STUCK for a dead-but-unreleased seat (specimen 2's exact shape).
 * All fixtures are frozen literals -- never live-DB reads (TESTING B4).
 */
import { describe, it, expect } from 'vitest';
import {
  classifyCommitmentLiveness,
  decideRelayDrops,
  loadCounterpartySessions,
  COMMITMENT_LIVENESS_CUT_POINT_MINUTES,
  LIVENESS,
  TRACKED_INBOUND_KINDS,
} from '../../../lib/coordinator/relay-drop-gauge.cjs';
import { PAYLOAD_KINDS } from '../../../lib/fleet/worker-status.cjs';

const NOW = Date.parse('2026-08-30T20:00:00Z');

describe('classifyCommitmentLiveness (FR-1)', () => {
  it('TS-2: a released_at=NULL, dead/frozen counterparty (specimen 2 shape) classifies ORPHANED via the classifySeat() OR-leg', () => {
    const deadUnreleasedSeat = {
      session_id: 'f27a883d',
      released_at: null,
      last_tool_at: new Date(NOW - 300 * 60 * 1000).toISOString(), // 300min silent, past the 120min cut
    };
    expect(classifyCommitmentLiveness(deadUnreleasedSeat, { now: NOW })).toBe(LIVENESS.ORPHANED);
  });

  it('a counterparty with released_at set classifies ORPHANED regardless of last_tool_at', () => {
    const releasedSeat = {
      session_id: 'released-1',
      released_at: '2026-08-30T19:00:00Z',
      last_tool_at: new Date(NOW - 60 * 1000).toISOString(), // 1min ago -- would read HEALTHY on tool clock alone
    };
    expect(classifyCommitmentLiveness(releasedSeat, { now: NOW })).toBe(LIVENESS.ORPHANED);
  });

  it('TS-3: a live, healthy counterparty classifies PENDING, never ORPHANED', () => {
    const healthySeat = {
      session_id: 'healthy-1',
      released_at: null,
      last_tool_at: new Date(NOW - 60 * 1000).toISOString(),
    };
    expect(classifyCommitmentLiveness(healthySeat, { now: NOW })).toBe(LIVENESS.PENDING);
  });

  it('a null/unresolved session classifies UNKNOWN, which fails open (never ORPHANED)', () => {
    expect(classifyCommitmentLiveness(null, { now: NOW })).toBe(LIVENESS.UNKNOWN);
  });

  it('a counterparty with no last_tool_at ever written classifies UNKNOWN (classifySeat NO_TOOL_CLOCK), not ORPHANED', () => {
    const neverWroteToolClock = { session_id: 'blind-1', released_at: null, last_tool_at: null };
    expect(classifyCommitmentLiveness(neverWroteToolClock, { now: NOW })).toBe(LIVENESS.UNKNOWN);
  });

  it('the cut point is a named constant, not the stuck-seat module default (which has none)', () => {
    expect(COMMITMENT_LIVENESS_CUT_POINT_MINUTES).toBe(120);
  });
});

describe('decideRelayDrops counterpartyLiveness (FR-2, orthogonal field, never overloads action)', () => {
  const baseRow = {
    id: 'r1',
    payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, id: 'r1' },
    created_at: new Date(NOW - 20 * 60 * 1000).toISOString(), // past the 15min default window -> flag
    target_session: 'f27a883d',
  };

  it('attaches counterpartyLiveness alongside action=flag without changing the action value', () => {
    const decisions = decideRelayDrops([baseRow], [], {
      now: NOW,
      livenessOf: () => LIVENESS.ORPHANED,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('flag');
    expect(decisions[0].counterpartyLiveness).toBe(LIVENESS.ORPHANED);
  });

  it('leaves counterpartyLiveness undefined when no livenessOf resolver is supplied (existing callers unaffected)', () => {
    const decisions = decideRelayDrops([baseRow], [], { now: NOW });
    expect(decisions[0].counterpartyLiveness).toBeUndefined();
    expect(Object.keys(decisions[0]).sort()).toEqual(['action', 'ageMs', 'correlationId', 'counterpartyLiveness', 'id', 'reason'].sort());
  });

  it('a resolved (satisfied) row still carries counterpartyLiveness for observability, not just flagged ones', () => {
    const outbound = [{ payload: { kind: PAYLOAD_KINDS.RELAY_CONFIRM, correlation_id: 'r1' } }];
    const decisions = decideRelayDrops([baseRow], outbound, {
      now: NOW,
      livenessOf: () => LIVENESS.PENDING,
    });
    expect(decisions[0].action).toBe('ok');
    expect(decisions[0].counterpartyLiveness).toBe(LIVENESS.PENDING);
  });

  it('TRACKED_INBOUND_KINDS is unchanged by this SD (B3: no widening, avoids the solomon_consult false-flag risk)', () => {
    expect(TRACKED_INBOUND_KINDS).toEqual([PAYLOAD_KINDS.RELAY_REQUEST, 'decision_request', 'review_request']);
  });
});

describe('loadCounterpartySessions (FR-1 IO shell, fail-soft)', () => {
  function makeSupabase(rows) {
    return {
      from() { return this; },
      select() { return this; },
      in() { return Promise.resolve({ data: rows }); },
    };
  }

  it('returns an empty map when no inbound rows carry a target_session', async () => {
    const result = await loadCounterpartySessions(makeSupabase([]), [{ id: 'x' }]);
    expect(result).toEqual({});
  });

  it('keys the returned map by session_id', async () => {
    const rows = [{ session_id: 'f27a883d', released_at: null, last_tool_at: null }];
    const result = await loadCounterpartySessions(makeSupabase(rows), [{ target_session: 'f27a883d' }]);
    expect(result['f27a883d']).toEqual(rows[0]);
  });

  it('fails soft to {} when the query throws', async () => {
    const throwingSupabase = {
      from() { return this; },
      select() { return this; },
      in() { throw new Error('boom'); },
    };
    const result = await loadCounterpartySessions(throwingSupabase, [{ target_session: 'x' }]);
    expect(result).toEqual({});
  });
});
