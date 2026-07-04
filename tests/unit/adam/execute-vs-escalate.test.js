/**
 * Tests for the Adam execute-vs-escalate 3-gate classifier.
 * SD-LEO-INFRA-ADAM-EXECUTE-VS-ESCALATE-CLASSIFIER-001
 *
 * TS-1 classifyDecision truth table (+ conservative uncertainty)
 * TS-2 gatesFromSignals trigger mapping
 * TS-3 classifyDecisionQuestion over-ask via the classifier
 * TS-4 probeDecisionRubric end-to-end PASS/FAIL/UNKNOWN
 */
import { describe, it, expect } from 'vitest';
import { classifyDecision, gatesFromSignals, shouldExecute, VERDICT } from '../../../lib/adam/execute-vs-escalate.js';
import { classifyDecisionQuestion, probeDecisionRubric } from '../../../lib/adam/adherence-probes.js';

// ── TS-1: classifyDecision truth table ───────────────────────────────────────
describe('classifyDecision', () => {
  const clear = { reversible: true, inRole: true, flagship: false, governance: false, dataLoss: false };

  it('executes only when all gates clear', () => {
    const r = classifyDecision(clear);
    expect(r.verdict).toBe(VERDICT.EXECUTE);
    expect(r.reasons).toEqual([]);
    expect(shouldExecute(clear)).toBe(true);
  });

  it('escalates with the correct reason for each blast-radius gate', () => {
    expect(classifyDecision({ ...clear, flagship: true }).reasons).toContain('flagship');
    expect(classifyDecision({ ...clear, governance: true }).reasons).toContain('governance');
    expect(classifyDecision({ ...clear, dataLoss: true }).reasons).toContain('data-loss');
    expect(classifyDecision({ ...clear, flagship: true }).verdict).toBe(VERDICT.ESCALATE);
  });

  it('is conservative: uncertain reversibility/role escalates', () => {
    expect(classifyDecision({ ...clear, reversible: null }).verdict).toBe(VERDICT.ESCALATE);
    expect(classifyDecision({ ...clear, reversible: null }).reasons).toContain('reversibility-uncertain');
    expect(classifyDecision({ ...clear, inRole: undefined }).reasons).toContain('role-uncertain');
    // missing inputs entirely => both uncertain => escalate
    expect(classifyDecision({}).verdict).toBe(VERDICT.ESCALATE);
  });

  it('distinguishes false (explicit) from uncertain (null) reasons', () => {
    expect(classifyDecision({ ...clear, reversible: false }).reasons).toContain('irreversible');
    expect(classifyDecision({ ...clear, inRole: false }).reasons).toContain('out-of-role');
  });

  it('lists every failed gate together', () => {
    const r = classifyDecision({ reversible: false, inRole: false, flagship: true, governance: true, dataLoss: true });
    expect(r.reasons).toEqual(expect.arrayContaining(['irreversible', 'out-of-role', 'flagship', 'governance', 'data-loss']));
    expect(r.verdict).toBe(VERDICT.ESCALATE);
  });
});

// ── TS-2: gatesFromSignals trigger mapping ───────────────────────────────────
describe('gatesFromSignals', () => {
  it('no trigger + already-determined => reversible+in-role, gates clear (execute)', () => {
    const g = gatesFromSignals({ trigger: null, alreadyDetermined: true });
    expect(g).toMatchObject({ reversible: true, inRole: true, flagship: false, governance: false, dataLoss: false });
    expect(classifyDecision(g).verdict).toBe(VERDICT.EXECUTE);
  });

  it('no trigger + NOT already-determined => reversibility uncertain (escalate)', () => {
    const g = gatesFromSignals({ trigger: null, alreadyDetermined: false });
    expect(g.reversible).toBeNull();
    expect(classifyDecision(g).verdict).toBe(VERDICT.ESCALATE);
  });

  it('maps each COMES_TO_HIM trigger to the documented gate(s) => escalate', () => {
    expect(gatesFromSignals({ trigger: 'new-strategy-or-policy', alreadyDetermined: true })).toMatchObject({ governance: true, inRole: false });
    expect(gatesFromSignals({ trigger: 'reserved-kill-gate', alreadyDetermined: true })).toMatchObject({ governance: true, flagship: true });
    expect(gatesFromSignals({ trigger: 'ratified-deviation', alreadyDetermined: true })).toMatchObject({ governance: true });
    expect(gatesFromSignals({ trigger: 'irreversible-or-external', alreadyDetermined: true })).toMatchObject({ reversible: false, flagship: true });
    for (const t of ['new-strategy-or-policy', 'reserved-kill-gate', 'ratified-deviation', 'irreversible-or-external']) {
      expect(classifyDecision(gatesFromSignals({ trigger: t, alreadyDetermined: true })).verdict).toBe(VERDICT.ESCALATE);
    }
  });
});

// ── TS-3: classifyDecisionQuestion over-ask via the classifier ───────────────
describe('classifyDecisionQuestion (routed through the 3-gate classifier)', () => {
  it('flags an over-ask: reversible, already-determined default + proximate ask, no trigger', () => {
    const r = classifyDecisionQuestion('I recommend we defer this reversible disposition — should I proceed?');
    expect(r.overAsk).toBe(true);
    expect(r.decision.verdict).toBe(VERDICT.EXECUTE);
  });

  it('does NOT flag when a COMES-TO-HIM trigger fires (escalation warranted)', () => {
    const r = classifyDecisionQuestion('This is an irreversible production deploy with external spend — should I proceed?');
    expect(r.escalationWarranted).toBe(true);
    expect(r.overAsk).toBe(false);
    expect(r.decision.verdict).toBe(VERDICT.ESCALATE);
  });

  it('does NOT flag a pure status line (no decision-ask)', () => {
    const r = classifyDecisionQuestion('Sourced 3 SDs under the standing cap; all reversible dispositions.');
    expect(r.overAsk).toBe(false);
  });
});

// ── TS-4: probeDecisionRubric end-to-end ─────────────────────────────────────
describe('probeDecisionRubric', () => {
  it('PASS when there are zero over-asks', () => {
    const facts = { adamChairmanDecisionQuestionsInWindow: [{ body: 'Irreversible launch — your call?' }], adamMachineRaisedNoiseInWindow: [] };
    expect(probeDecisionRubric(facts).verdict).toBe('pass');
  });

  it('FAIL when an over-ask is present', () => {
    const facts = { adamChairmanDecisionQuestionsInWindow: [{ body: 'I recommend we shelve this reversible item — should I proceed?' }], adamMachineRaisedNoiseInWindow: [] };
    expect(probeDecisionRubric(facts).verdict).toBe('fail');
  });

  it('UNKNOWN when facts are unresolved (fail-loud, never a silent pass)', () => {
    expect(probeDecisionRubric({ adamChairmanDecisionQuestionsInWindow: null }).verdict).toBe('unknown');
    expect(probeDecisionRubric({}).verdict).toBe('unknown');
  });
});
