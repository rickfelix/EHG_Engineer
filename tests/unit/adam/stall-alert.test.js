/**
 * Unit pins for wiring genuine-stall detection to the EXISTING chairman escalation
 * channel (lib/chairman/record-pending-decision.mjs). SD-LEO-INFRA-UPSCALE-ADAM-
 * PROJECT-MANAGEMENT-DISCIPLINE-001-B (Child B / FR-3).
 *
 * recordPendingDecision already has its own dedicated test coverage
 * (tests/unit/chairman/record-pending-decision-escalation.test.js) — this suite tests
 * ONLY the wiring: does a genuine stall call it with the right args, does an intended
 * hold correctly NOT call it at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bumpMovementTicks, checkAndAlertStalls } from '../../../lib/adam/stall-alert.js';
import { DEFAULT_STALE_TICKS } from '../../../lib/adam/stall-detector.js';

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: vi.fn(async () => ({ recorded: true, id: 'dec-1', escalated: true })),
  escalateChairmanDecision: vi.fn(async () => ({ escalated: false, deduped: true })),
}));
import { recordPendingDecision, escalateChairmanDecision } from '../../../lib/chairman/record-pending-decision.mjs';

vi.mock('../../../lib/adam/task-ledger.js', () => ({ setStatus: vi.fn(async () => ({})) }));
import { setStatus } from '../../../lib/adam/task-ledger.js';

beforeEach(() => { recordPendingDecision.mockClear(); escalateChairmanDecision.mockClear(); setStatus.mockClear(); });

/**
 * Stateful chairman_decisions stub for the stall-digest supersede test: tracks a single "open
 * digest" slot that recordPendingDecision's mock populates (simulating the real insert) and the
 * findPendingStallDigest query reads back on later ticks. Only the query/update shapes
 * checkAndAlertStalls actually issues are implemented.
 */
function makeStallDigestSupabase() {
  const state = { digest: null };
  const updates = [];
  return {
    state,
    updates,
    from(table) {
      if (table !== 'chairman_decisions') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      return {
        select: () => ({
          eq: () => ({
            like: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: state.digest }) }),
              }),
            }),
          }),
        }),
        update: (vals) => ({
          eq: async (_col, id) => {
            updates.push({ id, vals });
            if (state.digest && state.digest.id === id) Object.assign(state.digest.brief_data, vals.brief_data);
            return { data: null, error: null };
          },
        }),
      };
    },
  };
}

/** Minimal supabase stub for the QF-20260704-319 correlation-terminal check
 *  (isCorrelationTerminal): session_coordination reply lookup + chairman_decisions
 *  ratified-decision lookup, matching only the query shapes stall-alert.js issues. */
function sbWithCorrelationState({ hasReply = false, hasRatifiedDecision = false } = {}) {
  return {
    from(table) {
      if (table === 'session_coordination') {
        return {
          select: () => ({
            filter: () => ({
              limit: async () => ({ data: hasReply ? [{ id: 'reply-1' }] : [], error: null }),
            }),
          }),
        };
      }
      if (table === 'chairman_decisions') {
        return {
          select: () => ({
            filter: () => ({
              neq: () => ({
                limit: async () => ({ data: hasRatifiedDecision ? [{ id: 'dec-x' }] : [], error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
    },
  };
}

/** Minimal supabase stub for strategic_directives_v2 status lookups (isSdTerminal). */
function sbWithSdStatus(statusBySdKey) {
  return {
    from: (table) => {
      if (table !== 'strategic_directives_v2') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      return {
        select: () => ({
          eq: (_col, val) => ({
            maybeSingle: async () => ({ data: val in statusBySdKey ? { status: statusBySdKey[val] } : null }),
          }),
        }),
      };
    },
  };
}

/** Minimal supabase stub for strategic_directives_v2 metadata lookups (isSdIntentionallyHeld). */
function sbWithSdMetadata(metadataBySdKey) {
  return {
    from: (table) => {
      if (table !== 'strategic_directives_v2') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      return {
        select: () => ({
          eq: (_col, val) => ({
            maybeSingle: async () => ({ data: val in metadataBySdKey ? { metadata: metadataBySdKey[val] } : null }),
          }),
        }),
      };
    },
  };
}

describe('bumpMovementTicks', () => {
  it('resets to 0 when updated_at differs from the snapshot (real movement)', () => {
    const node = { id: 'p1', updated_at: '2026-07-01T12:00:00Z' };
    const prev = { p1: { updated_at: '2026-07-01T11:00:00Z', ticks: 5 } };
    expect(bumpMovementTicks(node, prev)).toBe(0);
  });

  it('increments when updated_at is unchanged (no movement)', () => {
    const node = { id: 'p1', updated_at: '2026-07-01T11:00:00Z' };
    const prev = { p1: { updated_at: '2026-07-01T11:00:00Z', ticks: 5 } };
    expect(bumpMovementTicks(node, prev)).toBe(6);
  });

  it('starts at 0 for a node with no prior snapshot entry', () => {
    expect(bumpMovementTicks({ id: 'new', updated_at: 'x' }, {})).toBe(0);
  });
});

describe('checkAndAlertStalls', () => {
  const sb = {}; // never touched directly — recordPendingDecision is mocked

  it('TS-4: a genuine stall on a critical-path parent calls recordPendingDecision(raisedBy:adam, blocking:true)', async () => {
    const parents = [{ id: 'p1', title: 'Run#5 GO', updated_at: 'fixed', inFlightNextStep: false }];
    // pre-seed the snapshot so this node is already at the stale threshold
    const prevSnapshot = { p1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);

    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    const call = recordPendingDecision.mock.calls[0][1];
    expect(call.raisedBy).toBe('adam');
    expect(call.blocking).toBe(true);
    expect(alerted).toEqual([{ id: 'p1', title: 'Run#5 GO', escalated: true }]);
  });

  it('TS-5: an intended hold does NOT call recordPendingDecision — no escalation noise', async () => {
    const parents = [{ id: 'p2', title: 'Daemon reswap in flight', updated_at: 'fixed', inFlightNextStep: true }];
    const prevSnapshot = { p2: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);

    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('a fresh node (below the stale threshold) does not escalate', async () => {
    const parents = [{ id: 'p3', title: 'Just started', updated_at: 'x', inFlightNextStep: false }];
    const { alerted } = await checkAndAlertStalls(sb, parents, {});
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('returns an updated snapshot for every parent processed', async () => {
    const parents = [{ id: 'p4', title: 'x', updated_at: 'v1', inFlightNextStep: false }];
    const { snapshot } = await checkAndAlertStalls(sb, parents, {});
    expect(snapshot.p4).toEqual({ updated_at: 'v1', ticks: 0 });
  });
});

describe('QF-20260703-229: false-stall flood fix', () => {
  const sb = {};

  it('skips a node whose board status is already terminal (done/cancelled) — never a stall', async () => {
    const parents = [
      { id: 'd1', title: 'Done thread', updated_at: 'fixed', status: 'done', inFlightNextStep: false },
      { id: 'c1', title: 'Cancelled thread', updated_at: 'fixed', status: 'cancelled', inFlightNextStep: false },
    ];
    const prevSnapshot = {
      d1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 },
      c1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 },
    };
    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('self-heals a sourced_sd node whose linked SD already completed — closes it, does not alert', async () => {
    const stubSb = sbWithSdStatus({ 'SD-DONE-001': 'completed' });
    const parents = [{
      id: 'sd1', title: 'Ship SD-DONE-001', updated_at: 'fixed',
      source_kind: 'sourced_sd', source_ref: 'SD-DONE-001', inFlightNextStep: false,
    }];
    const prevSnapshot = { sd1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);

    expect(setStatus).toHaveBeenCalledWith(stubSb, 'sd1', 'done');
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('still alerts a sourced_sd node whose linked SD is genuinely still open', async () => {
    const stubSb = sbWithSdStatus({ 'SD-OPEN-001': 'in_progress' });
    const parents = [{
      id: 'sd2', title: 'Ship SD-OPEN-001', updated_at: 'fixed',
      source_kind: 'sourced_sd', source_ref: 'SD-OPEN-001', inFlightNextStep: false,
    }];
    const prevSnapshot = { sd2: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);

    expect(setStatus).not.toHaveBeenCalled();
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'sd2', title: 'Ship SD-OPEN-001', escalated: true }]);
  });

  it('QF-20260704-964: suppresses a sourced_sd node whose linked SD is an intended hold (requires_human_action) — no filing, no false-done', async () => {
    const stubSb = sbWithSdMetadata({ 'SD-HELD-001': { requires_human_action: true } });
    const parents = [{
      id: 'sd3', title: 'UIUX-remediation orchestrator', updated_at: 'fixed',
      source_kind: 'sourced_sd', source_ref: 'SD-HELD-001', inFlightNextStep: false,
    }];
    const prevSnapshot = { sd3: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);

    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled(); // held, not finished — must not be marked done
    expect(alerted).toEqual([]);
  });

  it('QF-20260704-964: suppresses a sourced_sd node whose linked SD needs_coordinator_review', async () => {
    const stubSb = sbWithSdMetadata({ 'SD-HELD-002': { needs_coordinator_review: true } });
    const parents = [{
      id: 'sd4', title: 'Pilot-gated SD', updated_at: 'fixed',
      source_kind: 'sourced_sd', source_ref: 'SD-HELD-002', inFlightNextStep: false,
    }];
    const prevSnapshot = { sd4: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);

    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('caps escalation at ONE digest decision for multiple genuine stalls — never per-node (the 82-row flood)', async () => {
    const parents = [
      { id: 'a', title: 'Thread A', updated_at: 'fixed', inFlightNextStep: false },
      { id: 'b', title: 'Thread B', updated_at: 'fixed', inFlightNextStep: false },
      { id: 'c', title: 'Thread C', updated_at: 'fixed', inFlightNextStep: false },
    ];
    const prevSnapshot = Object.fromEntries(parents.map((p) => [p.id, { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 }]));

    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);

    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    const call = recordPendingDecision.mock.calls[0][1];
    expect(call.context.node_ids).toEqual(['a', 'b', 'c']);
    expect(alerted).toHaveLength(3);
    expect(alerted.every((a) => a.escalated === true)).toBe(true);
  });
});

describe('QF-20260704-319: advisory_thread correlation-terminal self-heal', () => {
  const parents = [{
    id: 'commission-1', title: 'Standing strategist commission', updated_at: 'fixed',
    source_kind: 'advisory_thread', source_ref: 'adam-solomon-standing-strategist-001', inFlightNextStep: false,
  }];
  const prevSnapshot = { 'commission-1': { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

  it('a correlation with a delivered reply self-heals — never files even at high tick-count', async () => {
    const stubSb = sbWithCorrelationState({ hasReply: true });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(setStatus).toHaveBeenCalledWith(stubSb, 'commission-1', 'done');
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('a correlation with a ratified (non-pending) chairman decision also self-heals', async () => {
    const stubSb = sbWithCorrelationState({ hasReply: false, hasRatifiedDecision: true });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(setStatus).toHaveBeenCalledWith(stubSb, 'commission-1', 'done');
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('a genuinely open correlation (no reply, no decision) still escalates', async () => {
    const stubSb = sbWithCorrelationState({ hasReply: false, hasRatifiedDecision: false });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(setStatus).not.toHaveBeenCalled();
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'commission-1', title: 'Standing strategist commission', escalated: true }]);
  });
});

describe('QF-20260710-818: manual node intended-hold suppression (status=blocked)', () => {
  const sb = {};

  it('suppresses a manual node held via status=blocked — no filing, no false-done', async () => {
    const parents = [{
      id: 'm1', title: 'Routed to Solomon consult', updated_at: 'fixed', status: 'blocked',
      source_kind: 'manual', inFlightNextStep: false,
    }];
    const prevSnapshot = { m1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);

    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled(); // held, not finished — must not be marked done
    expect(alerted).toEqual([]);
  });

  it('still alerts a manual node that is genuinely stale (status is open, not blocked)', async () => {
    const parents = [{
      id: 'm2', title: 'Genuinely stuck manual task', updated_at: 'fixed', status: 'open',
      source_kind: 'manual', inFlightNextStep: false,
    }];
    const prevSnapshot = { m2: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);

    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'm2', title: 'Genuinely stuck manual task', escalated: true }]);
  });
});

describe('QF-20260710-818: dismissed stall digest cooldown (no immediate respawn)', () => {
  const parents = [{ id: 'p1', title: 'Stuck thread', updated_at: 'fixed', inFlightNextStep: false }];
  const prevSnapshot = { p1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

  function sbWithDismissedDigest(dismissedDigest) {
    return {
      from(table) {
        if (table !== 'chairman_decisions') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
        return {
          select: () => ({
            eq: () => ({ like: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
            neq: () => ({ like: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: dismissedDigest }) }) }) }) }),
          }),
        };
      },
    };
  }

  it('suppresses re-escalation when a recently-dismissed digest covers the same node', async () => {
    const stubSb = sbWithDismissedDigest({
      id: 'dec-old', brief_data: { context: { node_ids: ['p1'] } }, updated_at: new Date().toISOString(),
    });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([{ id: 'p1', title: 'Stuck thread', escalated: false }]);
  });

  it('still escalates when the dismissed digest does not overlap the current node_ids', async () => {
    const stubSb = sbWithDismissedDigest({
      id: 'dec-old', brief_data: { context: { node_ids: ['unrelated-node'] } }, updated_at: new Date().toISOString(),
    });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'p1', title: 'Stuck thread', escalated: true }]);
  });

  it('still escalates once the dismissed digest is outside the cooldown window', async () => {
    const stubSb = sbWithDismissedDigest({
      id: 'dec-old', brief_data: { context: { node_ids: ['p1'] } },
      updated_at: new Date(Date.now() - 60 * 60_000).toISOString(), // 1h ago, past the 15m cooldown
    });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'p1', title: 'Stuck thread', escalated: true }]);
  });

  it('escalates normally when no dismissed digest exists at all', async () => {
    const stubSb = sbWithDismissedDigest(null);
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'p1', title: 'Stuck thread', escalated: true }]);
  });
});

describe('SD-LEO-INFRA-STALL-CLASSIFIER-HELD-STATE-001 (FR-1): board status=blocked is an intended hold for every source_kind', () => {
  const sb = {};

  it('TS-1: a sourced_sd node with status=blocked and no held metadata never escalates', async () => {
    const parents = [{
      id: 'sd5', title: 'Solomon-gated design queue item', updated_at: 'fixed', status: 'blocked',
      source_kind: 'sourced_sd', source_ref: 'SD-GATED-001', inFlightNextStep: false,
    }];
    const prevSnapshot = { sd5: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);

    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('TS-2: an advisory_thread node with status=blocked never escalates and is not closed', async () => {
    const parents = [{
      id: 'at1', title: 'Belt QF held', updated_at: 'fixed', status: 'blocked',
      source_kind: 'advisory_thread', source_ref: 'some-correlation', inFlightNextStep: false,
    }];
    const prevSnapshot = { at1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const stubSb = sbWithCorrelationState({ hasReply: false, hasRatifiedDecision: false });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);

    expect(setStatus).not.toHaveBeenCalled();
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('a node with no source_kind at all (bare status=blocked) is still suppressed', async () => {
    const parents = [{ id: 'x1', title: 'Fable-gated item', updated_at: 'fixed', status: 'blocked', inFlightNextStep: false }];
    const prevSnapshot = { x1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);

    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('regression: the retired literal suppression string is gone from the source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../../lib/adam/stall-alert.js', import.meta.url), 'utf8');
    expect(src).not.toContain('Suppressing stall alert for held manual node');
  });
});

describe('SD-LEO-INFRA-STALL-CLASSIFIER-HELD-STATE-001 (FR-2): claimed-and-progressing SD never stalls', () => {
  function sbWithSdProgress({ claimingSessionId, claimHistory = [], handoffs = [] } = {}) {
    return {
      from(table) {
        if (table === 'strategic_directives_v2') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: 'sd-uuid-1', claiming_session_id: claimingSessionId, metadata: { claim_history: claimHistory } },
                }),
              }),
            }),
          };
        }
        if (table === 'sd_phase_handoffs') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: handoffs }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      },
    };
  }

  const prevSnapshot = { sdp1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };
  const parents = [{
    id: 'sdp1', title: 'Dispatch-auth phase-2 build', updated_at: 'fixed',
    source_kind: 'sourced_sd', source_ref: 'SD-PROGRESSING-001', inFlightNextStep: false,
  }];

  it('TS-4: a fresh claim_history entry suppresses the stall even at the exact stale threshold', async () => {
    const stubSb = sbWithSdProgress({
      claimingSessionId: 'sess-live',
      claimHistory: [{ claimed_at: new Date().toISOString(), session_id: 'sess-live' }],
    });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('TS-5: a fresh sd_phase_handoffs row (no recent claim_history) also suppresses the stall', async () => {
    const stubSb = sbWithSdProgress({
      claimingSessionId: 'sess-live',
      claimHistory: [{ claimed_at: new Date(Date.now() - 60 * 60_000).toISOString(), session_id: 'sess-live' }],
      handoffs: [{ created_at: new Date().toISOString() }],
    });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('an SD with no active claim is unaffected and still escalates', async () => {
    const stubSb = sbWithSdProgress({ claimingSessionId: null });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'sdp1', title: 'Dispatch-auth phase-2 build', escalated: true }]);
  });

  it('a claim/handoff outside the progress window does not suppress — still escalates', async () => {
    const stubSb = sbWithSdProgress({
      claimingSessionId: 'sess-stale',
      claimHistory: [{ claimed_at: new Date(Date.now() - 60 * 60_000).toISOString(), session_id: 'sess-stale' }],
      handoffs: [{ created_at: new Date(Date.now() - 60 * 60_000).toISOString() }],
    });
    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'sdp1', title: 'Dispatch-auth phase-2 build', escalated: true }]);
  });

  it('TS-6: a DB error inside the progress check degrades to "not progressing" — never silently swallows a real stall', async () => {
    const throwingSb = {
      from(table) {
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error('boom'); } }) }) };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      },
    };
    const { alerted } = await checkAndAlertStalls(throwingSb, parents, prevSnapshot);
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'sdp1', title: 'Dispatch-auth phase-2 build', escalated: true }]);
  });
});

describe('SD-LEO-INFRA-STALL-CLASSIFIER-HELD-STATE-001 (FR-3): dismissal cooloff survives set-membership drift', () => {
  function sbWithDismissedDigest(dismissedDigest) {
    return {
      from(table) {
        if (table !== 'chairman_decisions') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
        return {
          select: () => ({
            eq: () => ({ like: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
            neq: () => ({ like: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: dismissedDigest }) }) }) }) }),
          }),
        };
      },
    };
  }

  it('TS-7 (reproduces 12fe548f -> b4c46dc9 verbatim): an identical re-check of a dismissed 6-node set files nothing new', async () => {
    const nodeIds = ['e945b024', 'b9e14859', 'ec603e38', '3e170e0e', '142cd353', '1dba6cf3'];
    const stubSb = sbWithDismissedDigest({
      id: 'dec-12fe548f', brief_data: { context: { node_ids: nodeIds } }, updated_at: new Date().toISOString(),
    });
    const parents = nodeIds.map((id) => ({ id, title: `Thread ${id}`, updated_at: 'fixed', inFlightNextStep: false }));
    const prevSnapshot = Object.fromEntries(nodeIds.map((id) => [id, { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 }]));

    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);

    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toHaveLength(6);
    expect(alerted.every((a) => a.escalated === false)).toBe(true);
  });

  it('TS-8: dismissed set [A,B,C] plus new node D inside cooloff -- only D surfaces as a delta', async () => {
    const stubSb = sbWithDismissedDigest({
      id: 'dec-old', brief_data: { context: { node_ids: ['A', 'B', 'C'] } }, updated_at: new Date().toISOString(),
    });
    const parents = ['A', 'B', 'C', 'D'].map((id) => ({ id, title: `Thread ${id}`, updated_at: 'fixed', inFlightNextStep: false }));
    const prevSnapshot = Object.fromEntries(['A', 'B', 'C', 'D'].map((id) => [id, { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 }]));

    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);

    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    const call = recordPendingDecision.mock.calls[0][1];
    expect(call.context.node_ids).toEqual(['D']);

    const byId = Object.fromEntries(alerted.map((a) => [a.id, a.escalated]));
    expect(byId).toEqual({ A: false, B: false, C: false, D: true });
  });

  it('TS-9: no prior dismissal at all -- full escalation is unchanged from today', async () => {
    const stubSb = sbWithDismissedDigest(null);
    const parents = [{ id: 'p9', title: 'Stuck thread', updated_at: 'fixed', inFlightNextStep: false }];
    const prevSnapshot = { p9: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(stubSb, parents, prevSnapshot);

    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(alerted).toEqual([{ id: 'p9', title: 'Stuck thread', escalated: true }]);
  });
});

describe('QF-20260703-860: supersede the open stall digest instead of inserting per tick', () => {
  it('3 ticks against a persistent stale thread: exactly ONE recordPendingDecision insert, later ticks refresh the same row via update+re-attempted escalation (which dedupes)', async () => {
    const stubSb = makeStallDigestSupabase();
    recordPendingDecision.mockImplementationOnce(async (_sb, { title, context }) => {
      stubSb.state.digest = { id: 'dec-1', brief_data: { title, context, escalation_email_sent_at: '2026-07-04T01:00:00Z' } };
      return { recorded: true, id: 'dec-1', escalated: true };
    });

    const parents = [{ id: 'p1', title: 'Stuck thread', updated_at: 'fixed', inFlightNextStep: false }];
    const prevSnapshot = { p1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    // Tick 1: no existing digest — inserts.
    await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    // Ticks 2-3: the digest inserted above is now found — refresh in place, never insert again.
    await checkAndAlertStalls(stubSb, parents, prevSnapshot);
    await checkAndAlertStalls(stubSb, parents, prevSnapshot);

    expect(recordPendingDecision).toHaveBeenCalledTimes(1); // exactly ONE pending digest row created
    expect(escalateChairmanDecision).toHaveBeenCalledTimes(2); // ticks 2-3 re-attempt, both dedupe (0 new emails)
    expect(stubSb.updates).toHaveLength(2);
    expect(stubSb.updates.every((u) => u.id === 'dec-1')).toBe(true);
  });
});
