/**
 * SD-LEO-INFRA-ADAM-DECISION-RUBRIC-ENFORCE-001 — the decision-rubric over-ask probe.
 *
 * Pure tests for classifyDecisionQuestion + probeDecisionRubric: an Adam->chairman decision-question
 * that matches NO COMES-TO-HIM trigger AND is already-determined is a likely OVER-ASK (probe FAIL);
 * a reserved-gate / ratified-deviation / irreversible escalation is correctly NOT flagged; the probe
 * is advisory + fail-loud (null fact -> UNKNOWN). No DB / no IO.
 */
import { describe, it, expect } from 'vitest';
import { classifyDecisionQuestion, probeDecisionRubric, VERDICT } from '../../../lib/adam/adherence-probes.js';

describe('classifyDecisionQuestion — rubric', () => {
  it('flags an over-ask: a reversible, already-determined question matching no COMES-TO-HIM trigger', () => {
    const c = classifyDecisionQuestion(
      'Worker Delta finished its in-flight SD. I recommend we defer the stale fleet_retro P3 items to the backlog — should I proceed?',
    );
    expect(c.isDecisionQuestion).toBe(true);
    expect(c.escalationWarranted).toBe(false);
    expect(c.alreadyDetermined).toBe(true);
    expect(c.overAsk).toBe(true);
  });

  it('does NOT flag a legitimate escalation: a reserved kill-gate (S18) decision', () => {
    const c = classifyDecisionQuestion(
      'Venture-1 reached the S18 kill gate with a breakeven below the documented threshold. I recommend we proceed, but this is your call — approve?',
    );
    expect(c.escalationWarranted).toBe(true);
    expect(c.trigger).toBe('reserved-kill-gate');
    expect(c.overAsk).toBe(false);
  });

  it('does NOT flag a legitimate escalation: a ratified-decision deviation', () => {
    const c = classifyDecisionQuestion(
      'The gate output deviates from the ratified decision. Should I hold, or do you want to re-ratify?',
    );
    expect(c.escalationWarranted).toBe(true);
    expect(c.trigger).toBe('ratified-deviation');
    expect(c.overAsk).toBe(false);
  });

  it('does NOT flag a legitimate escalation: an irreversible / external action', () => {
    const c = classifyDecisionQuestion('Ready to launch venture-1 with the live Stripe payment integration — authorize?');
    expect(c.escalationWarranted).toBe(true);
    expect(c.overAsk).toBe(false);
  });

  it('does NOT flag an ambiguous question (conservative default — no ADAM-DECIDES signal)', () => {
    const c = classifyDecisionQuestion('What do you think about the belt today?');
    expect(c.escalationWarranted).toBe(false);
    expect(c.alreadyDetermined).toBe(false);
    expect(c.overAsk).toBe(false);
  });

  it('does NOT flag when the ask and the stated default are far apart (proximity gate suppresses co-occurrence in long prose)', () => {
    // A long reconciliation note: a decision-ASK near the start, an ADAM-DECIDES token >180 chars
    // later — the two co-occur by chance, not as the "I recommend X — should I proceed?" shape.
    const askEarly = 'Should I re-run the canonical backfill? ';
    const filler = 'I traced the register path and verified the lane column live; the source_type CHECK is sound; the dormant-engine read was wrong and is now corrected against ground truth. ';
    const decideLate = 'Separately, the stale P3 retro items are a reversible disposition.';
    const c = classifyDecisionQuestion(askEarly + filler + decideLate);
    expect(c.isDecisionQuestion).toBe(true);
    expect(c.alreadyDetermined).toBe(true); // both signals present in the body...
    expect(c.overAsk).toBe(false);          // ...but far apart -> NOT an over-ask (conservative)
  });

  it('does NOT flag a pure status advisory (no decision-ask, even if already-determined)', () => {
    const c = classifyDecisionQuestion('[harness] BELT COUNTDOWN — steady: 1 worker on UNIT-TEST-DEBT-TRIAGE; I am deferring the stale items.');
    expect(c.isDecisionQuestion).toBe(false);
    expect(c.overAsk).toBe(false);
  });
});

describe('probeDecisionRubric — verdict', () => {
  const overAskBody = 'I recommend we shelve the harness item as a reversible disposition — should I proceed?';
  const escalationBody = 'New pricing strategy proposed for venture-2 — this is your call, approve?';

  it('FAILs with an over-ask detail when >=1 likely over-ask is present', () => {
    const b = probeDecisionRubric({ adamChairmanDecisionQuestionsInWindow: [{ body: overAskBody }, { body: escalationBody }] });
    expect(b.verdict).toBe(VERDICT.FAIL);
    expect(b.probe).toBe('decision_rubric');
    expect(b.detail).toMatch(/over-ask/i);
  });

  it('PASSes when there are no over-asks (only legitimate escalations)', () => {
    const b = probeDecisionRubric({ adamChairmanDecisionQuestionsInWindow: [{ body: escalationBody }] });
    expect(b.verdict).toBe(VERDICT.PASS);
  });

  it('PASSes on an honest empty window (nothing to flag)', () => {
    const b = probeDecisionRubric({ adamChairmanDecisionQuestionsInWindow: [] });
    expect(b.verdict).toBe(VERDICT.PASS);
  });

  it('is advisory + fail-loud: a null fact yields UNKNOWN, never a silent pass', () => {
    expect(probeDecisionRubric({ adamChairmanDecisionQuestionsInWindow: null }).verdict).toBe(VERDICT.UNKNOWN);
    expect(probeDecisionRubric({}).verdict).toBe(VERDICT.UNKNOWN);
  });
});
