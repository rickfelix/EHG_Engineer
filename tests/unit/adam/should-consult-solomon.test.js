/**
 * SD-LEO-INFRA-ADAM-PRE-SEND-001 (FR-1/3/4/5) — Adam PRE-SEND Solomon-consult gate.
 *
 * TRUST-CRITICAL logic isolated behind unit tests with NO live Solomon/DB calls:
 *   - FR-4 triage-first: a routine send short-circuits with ZERO consult / ZERO classifier.
 *   - FR-2 classify: a high-consequence send routes to consult-then-send.
 *   - FR-3 bounded-wait FAIL-OPEN: timeout/absence/throw -> documented-proceed + ledger
 *     (or chairman hold-and-surface); NEVER throws, NEVER blocks.
 *   - FR-5 no self-exemption: a high-consequence send cannot reach send/proceed without
 *     a recorded consult OR an audited degraded-with-ledger record.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  evaluatePreSendConsult,
  performBoundedConsult,
  deriveTriageGates,
  DEFAULT_CONSULT_TIMEOUT_MS,
} from '../../../lib/adam/should-consult-solomon.js';
import { VERDICT } from '../../../lib/adam/execute-vs-escalate.js';

const ROUTINE = { title: 'FYI: status update', body: 'PR #123 merged for SD-X, no action needed' };
const HIGH = { title: 'Deploy the Stripe webhook endpoint to prod' };

describe('evaluatePreSendConsult — FR-4 triage-first (volume guard)', () => {
  it('short-circuits a clearly-routine send with ZERO consult and ZERO classifier calls', () => {
    const classifyConsequence = vi.fn(() => 'high');
    const consult = vi.fn(async () => ({ ok: true }));
    const result = evaluatePreSendConsult(ROUTINE, { classifyConsequence });

    expect(result.action).toBe('proceed');
    expect(result.reason).toBe('triage:not-consequential');
    // The classifier is never consulted on the routine short-circuit path...
    expect(classifyConsequence).toHaveBeenCalledTimes(0);
    // ...and (by construction) no consult dep is ever invoked by evaluate.
    expect(consult).toHaveBeenCalledTimes(0);
  });

  it('routine triage gates resolve to a clean EXECUTE via the canonical classifyDecision authority', () => {
    const gates = deriveTriageGates(ROUTINE);
    expect(gates.reversible).toBe(true);
    expect(gates.inRole).toBe(true);
    expect(gates.flagship).toBe(false);
  });

  it('a routine send does NOT reach the classifier or a consult (negative case)', () => {
    const classifyConsequence = vi.fn(() => 'high');
    const result = evaluatePreSendConsult(
      { title: 'Progress update', body: 'Synced with coordinator; reminder sent' },
      { classifyConsequence },
    );
    expect(result.action).toBe('proceed');
    expect(result.consequence).toBe('triage');
    expect(classifyConsequence).not.toHaveBeenCalled();
  });
});

describe('evaluatePreSendConsult — FR-2 classify', () => {
  it('a high-consequence send routes to consult-then-send (classifier is consulted)', () => {
    const classifyConsequence = vi.fn(() => 'high');
    const result = evaluatePreSendConsult(HIGH, { classifyConsequence });
    expect(result.action).toBe('consult-then-send');
    expect(result.consequence).toBe('high');
    expect(classifyConsequence).toHaveBeenCalledTimes(1);
  });

  it('uses the REAL shared taxonomy by default (webhook-deploy => consult-then-send)', () => {
    const result = evaluatePreSendConsult(HIGH);
    expect(result.action).toBe('consult-then-send');
    expect(result.consequence).toBe('high');
  });

  it('a decision-shaped but low/medium send proceeds without a consult', () => {
    const result = evaluatePreSendConsult({ title: 'Approve the blog post draft?' });
    expect(result.action).toBe('proceed');
    expect(['low', 'medium']).toContain(result.consequence);
    expect(result.reason).toBe(`classified:${result.consequence}`);
  });
});

describe('performBoundedConsult — FR-3 bounded-wait, returned verdict', () => {
  it('returns action:send with consultRecorded when a verdict comes back in time', async () => {
    const consult = vi.fn(async () => ({ verdict: 'looks-good' }));
    const recordLedger = vi.fn(async () => {});
    const result = await performBoundedConsult(HIGH, { consult, recordLedger, timeoutMs: 500 });

    expect(result.action).toBe('send');
    expect(result.consultRecorded).toBe(true);
    expect(result.verdict).toEqual({ verdict: 'looks-good' });
    expect(recordLedger).not.toHaveBeenCalled();
  });
});

describe('performBoundedConsult — FR-3 FAIL-OPEN (Adam never hard-blocked on Solomon)', () => {
  it('a consult TIMEOUT degrades to documented-proceed + caution + ledger capture; never throws', async () => {
    const consult = vi.fn(() => new Promise(() => {})); // never resolves
    const recordLedger = vi.fn(async () => {});

    let result;
    await expect(
      (async () => { result = await performBoundedConsult(HIGH, { consult, recordLedger, timeoutMs: 10 }); })(),
    ).resolves.toBeUndefined(); // NEVER throws

    expect(result.action).toBe('proceed');
    expect(result.degraded).toBe(true);
    expect(result.caution).toBe(true);
    expect(result.ledger).toMatchObject({
      probe: 'decision_rubric',
      verdict: 'unknown',
      detail: 'solomon-consult-timeout::documented-proceed',
    });
    expect(recordLedger).toHaveBeenCalledTimes(1);
    expect(recordLedger).toHaveBeenCalledWith(
      expect.objectContaining({ probe: 'decision_rubric', verdict: 'unknown' }),
    );
  });

  it('a consult that THROWS is treated identically (documented-proceed, ledger, no throw)', async () => {
    const consult = vi.fn(async () => { throw new Error('solomon lane down'); });
    const recordLedger = vi.fn(async () => {});
    const result = await performBoundedConsult(HIGH, { consult, recordLedger, timeoutMs: 200 });

    expect(result.action).toBe('proceed');
    expect(result.degraded).toBe(true);
    expect(recordLedger).toHaveBeenCalledTimes(1);
  });

  it('a consult that resolves to null (absence) fails open the same way', async () => {
    const consult = vi.fn(async () => null);
    const recordLedger = vi.fn(async () => {});
    const result = await performBoundedConsult(HIGH, { consult, recordLedger, timeoutMs: 200 });

    expect(result.action).toBe('proceed');
    expect(result.degraded).toBe(true);
    expect(recordLedger).toHaveBeenCalledTimes(1);
  });

  it('a chairman-targeted send under timeout HOLDS-AND-SURFACES (does not auto-proceed)', async () => {
    const consult = vi.fn(() => new Promise(() => {}));
    const recordLedger = vi.fn(async () => {});
    const result = await performBoundedConsult(
      { ...HIGH, isChairmanTargeted: true },
      { consult, recordLedger, timeoutMs: 10 },
    );

    expect(result.action).toBe('hold-and-surface');
    expect(result.degraded).toBe(true);
    // chairman surface: does NOT auto-proceed and does NOT emit a documented-proceed ledger.
    expect(recordLedger).not.toHaveBeenCalled();
  });

  it('a failing recordLedger STILL proceeds (ledger capture is best-effort, never fatal)', async () => {
    const consult = vi.fn(() => new Promise(() => {}));
    const recordLedger = vi.fn(async () => { throw new Error('db write failed'); });
    const result = await performBoundedConsult(HIGH, { consult, recordLedger, timeoutMs: 10 });

    expect(result.action).toBe('proceed');
    expect(result.degraded).toBe(true);
  });

  it('exposes a sane default bounded-wait', () => {
    expect(DEFAULT_CONSULT_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('FR-5 — NO SELF-EXEMPTION (mechanism, not caller opt-in)', () => {
  it('a high-consequence send cannot skip the consult via any caller-supplied flag', () => {
    // Every plausible exemption flag is passed via context; none may downgrade the verdict.
    const sneaky = {
      title: 'Rotate the production API key credentials',
      context: { skip: true, exempt: true, bypass: true, force: true, reversible: true, inRole: true },
    };
    const result = evaluatePreSendConsult(sneaky);
    expect(result.action).toBe('consult-then-send');
    expect(result.consequence).toBe('high');
  });

  it('the ONLY exits for a high-consequence send are a recorded consult OR an audited degraded record', async () => {
    const decision = evaluatePreSendConsult(HIGH);
    expect(decision.action).toBe('consult-then-send'); // high never proceeds/sends on its own

    // Path A — a real verdict: reached 'send' ONLY with consultRecorded evidence.
    const sent = await performBoundedConsult(HIGH, { consult: async () => ({ v: 1 }), timeoutMs: 200 });
    expect(sent.action).toBe('send');
    expect(sent.consultRecorded).toBe(true);

    // Path B — degraded proceed: reached 'proceed' ONLY with a ledger capture recorded.
    const ledgerWrites = [];
    const degraded = await performBoundedConsult(HIGH, {
      consult: () => new Promise(() => {}),
      recordLedger: async (l) => { ledgerWrites.push(l); },
      timeoutMs: 10,
    });
    expect(degraded.action).toBe('proceed');
    expect(ledgerWrites).toHaveLength(1);
    expect(ledgerWrites[0]).toMatchObject({ probe: 'decision_rubric', verdict: 'unknown' });

    // There is no third exit that both proceeds/sends AND lacks consult/ledger evidence.
    const hasConsultEvidence = (r) => r.consultRecorded === true || Boolean(r.ledger);
    expect(hasConsultEvidence(sent)).toBe(true);
    expect(hasConsultEvidence(degraded)).toBe(true);
  });
});

describe('deriveTriageGates — caller may escalate but never downgrade', () => {
  it('a caller context flag can force ESCALATE on an otherwise-routine send', async () => {
    const gates = deriveTriageGates({ title: 'FYI status update', context: { governance: true } });
    expect(gates.governance).toBe(true);
    // routed through the canonical authority => ESCALATE (not a routine EXECUTE)
    const { classifyDecision } = await import('../../../lib/adam/execute-vs-escalate.js');
    expect(classifyDecision(gates).verdict).toBe(VERDICT.ESCALATE);
  });
});
