/**
 * SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001 — pure predicate/envelope tests.
 * No mocking: isChairmanGated, buildDecisionEnvelope, envelopeIsDurablyActionable, and the
 * real shouldAutoEscalate/isEscalationActionable they compose are all pure functions.
 */
import { describe, it, expect } from 'vitest';
import {
  isChairmanGated,
  buildDecisionEnvelope,
  envelopeIsDurablyActionable,
} from '../../../lib/chairman/chairman-gated-decision-row-guard.mjs';

describe('TS-7: SD matches only via the requires_human_action_reason regex arm', () => {
  it('is chairman-gated even with no human_decider/decider key set', () => {
    const metadata = {
      requires_human_action: true,
      requires_human_action_reason: 'escalate to chairman for pricing sign-off',
    };
    expect(isChairmanGated(metadata)).toBe(true);
  });

  it('the human_decider arm alone is also sufficient (not solely relying on the regex arm)', () => {
    expect(isChairmanGated({ requires_human_action: true, human_decider: 'chairman' })).toBe(true);
  });

  it('neither arm matching is NOT gated', () => {
    expect(isChairmanGated({ requires_human_action: true, human_decider: 'coordinator', requires_human_action_reason: 'needs sourcing' })).toBe(false);
  });

  it('requires_human_action=false is never gated regardless of decider text', () => {
    expect(isChairmanGated({ requires_human_action: false, human_decider: 'chairman' })).toBe(false);
  });
});

describe('TS-8: deferred-status exclusion is a population-level filter, not a metadata predicate', () => {
  // isChairmanGated only inspects metadata (status is filtered upstream in fetchCandidateSDs'
  // query and the age-floor filter in runChairmanGatedDecisionRowGuard) — documented here so
  // the boundary is explicit: a deferred SD's metadata can still read as "chairman-gated",
  // it is EXCLUDED from the population by its status column, not by this predicate.
  it('isChairmanGated does not itself reject on status (status filtering happens upstream)', () => {
    expect(isChairmanGated({ requires_human_action: true, human_decider: 'chairman' })).toBe(true);
  });
});

describe('TS-6: regression guard — the recorded envelope is durably actionable, not just auto-escalating', () => {
  const sd = { sd_key: 'SD-ENV-001', created_at: new Date(Date.now() - 30 * 3600000).toISOString(), metadata: {} };

  it('buildDecisionEnvelope produces decision_type=session_question, blocking=true, raisedBy=adam (individual fields, not a derived boolean)', () => {
    const envelope = buildDecisionEnvelope(sd);
    expect(envelope.decisionType).toBe('session_question');
    expect(envelope.blocking).toBe(true);
    expect(envelope.raisedBy).toBe('adam');
    expect(envelope.context.kind).toBe('sd_unfence_go_defer');
    expect(envelope.context.sd_key).toBe('SD-ENV-001');
  });

  it('the built envelope satisfies BOTH shouldAutoEscalate() and isEscalationActionable()', () => {
    const envelope = buildDecisionEnvelope(sd);
    const check = envelopeIsDurablyActionable(envelope);
    expect(check.autoEscalates).toBe(true);
    expect(check.durablyActionable).toBe(true);
    expect(check.ok).toBe(true);
  });

  it('REGRESSION: the LEAD-phase-only-corrected shape (session_question, blocking=FALSE) auto-escalates but is NOT durably actionable — this module must never revert to it', () => {
    const check = envelopeIsDurablyActionable({ decisionType: 'session_question', blocking: false, raisedBy: 'adam' });
    expect(check.autoEscalates).toBe(true); // still fires the one-shot creation email...
    expect(check.durablyActionable).toBe(false); // ...but is invisible to the SLA sweep / digest forever after.
    expect(check.ok).toBe(false);
  });

  it('REGRESSION: the ORIGINAL inert shape (sd_unfence_go_defer, blocking=false) satisfies neither predicate', () => {
    const check = envelopeIsDurablyActionable({ decisionType: 'sd_unfence_go_defer', blocking: false, raisedBy: 'adam' });
    expect(check.ok).toBe(false);
  });

  it('a decision_type revert to sd_unfence_go_defer WITH blocking=true still satisfies both predicates — decision_type alone is not a sufficient guard, field-by-field assertion (this test) is required', () => {
    const check = envelopeIsDurablyActionable({ decisionType: 'sd_unfence_go_defer', blocking: true, raisedBy: 'adam' });
    expect(check.ok).toBe(true); // predicates alone would NOT catch this revert
    // ...which is exactly why buildDecisionEnvelope's own decision_type is asserted directly above, not inferred from the predicates.
  });
});
