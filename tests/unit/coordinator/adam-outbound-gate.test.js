import { describe, it, expect } from 'vitest';
import { checkAdamOutbound } from '../../../lib/coordinator/adam-outbound-gate.js';
import { MANIPULATIVE_PATTERNS } from '../../../lib/adam/rationale-bar.js';
import { classifyDecision, VERDICT } from '../../../lib/adam/execute-vs-escalate.js';
import workerStatus from '../../../lib/fleet/worker-status.cjs';

const { PAYLOAD_KINDS, DIRECTIVE_KINDS } = workerStatus;
const ADVISORY = PAYLOAD_KINDS.ADAM_ADVISORY;
const SOLOMON_CONSULT = PAYLOAD_KINDS.SOLOMON_CONSULT;

// GAP-warning: assert the CJS->ESM interop actually yields the kind constants (else the gate's
// exemptions would silently disable themselves).
describe('kind-constant interop (CJS -> ESM)', () => {
  it('resolves advisory/solomon/directive kinds non-undefined', () => {
    expect(ADVISORY).toBe('adam_advisory');
    expect(SOLOMON_CONSULT).toBe('solomon_consult');
    expect(DIRECTIVE_KINDS).toContain('chairman_directive');
  });
});

describe('rationaleBar — advisory rationale bar (FR-2 / TS-1, TS-2)', () => {
  it('fails an advisory with no reasoning marker', () => {
    const r = checkAdamOutbound({ body: 'Parking the Alt-Text venture.', kind: ADVISORY });
    expect(r.checks.rationaleBar.pass).toBe(false);
    expect(r.verdict).toBe('block');
  });
  it('fails an advisory with manipulative framing (via the SHARED MANIPULATIVE_PATTERNS)', () => {
    const body = 'You need to act now — approve immediately, this is critical.';
    // Composition-identity: the same exported regex the gate uses must itself match this body.
    expect(MANIPULATIVE_PATTERNS.test(body)).toBe(true);
    const r = checkAdamOutbound({ body, kind: ADVISORY });
    expect(r.checks.rationaleBar.pass).toBe(false);
    expect(r.checks.rationaleBar.reason).toMatch(/manipulative|CONST-010/i);
  });
  it('passes a well-reasoned advisory', () => {
    const r = checkAdamOutbound({ body: 'Recommend parking Alt-Text because demand-test CHECK forbids truth_ metrics; rationale: no live anchor.', kind: ADVISORY });
    expect(r.checks.rationaleBar.pass).toBe(true);
  });
  it('fails a body-less advisory (no rationale possible)', () => {
    const r = checkAdamOutbound({ body: '   ', kind: ADVISORY });
    expect(r.checks.rationaleBar.pass).toBe(false);
    expect(r.checks.rationaleBar.reason).toMatch(/empty/i);
  });
  it('EXEMPTS a directive kind and a solomon_consult kind from the rationale bar', () => {
    const directive = checkAdamOutbound({ body: 'Pause all fleet claims.', kind: 'chairman_directive' });
    expect(directive.checks.rationaleBar.pass).toBe(true);
    const consult = checkAdamOutbound({ body: 'Which venture next?', kind: SOLOMON_CONSULT });
    expect(consult.checks.rationaleBar.pass).toBe(true);
  });
});

describe('shouldAnswer — should-answer rubric (FR-3 / TS-3, TS-4)', () => {
  const execDecision = { reversible: true, inRole: true }; // classifyDecision -> EXECUTE
  const escalateDecision = { reversible: true, inRole: true, flagship: true }; // -> ESCALATE

  it('composition-identity: the same classifyDecision the gate uses returns EXECUTE / ESCALATE here', () => {
    expect(classifyDecision(execDecision).verdict).toBe(VERDICT.EXECUTE);
    expect(classifyDecision(escalateDecision).verdict).toBe(VERDICT.ESCALATE);
  });
  it('trips when asking the chairman a decision that classifies EXECUTE', () => {
    const r = checkAdamOutbound(
      { body: 'Should we unpark the Alt-Text venture?', kind: SOLOMON_CONSULT, addressee: 'chairman', expectsReply: true },
      { decision: execDecision },
    );
    expect(r.checks.shouldAnswer.pass).toBe(false);
    expect(r.checks.shouldAnswer.reason).toMatch(/EXECUTE/);
  });
  it('passes when the chairman question classifies ESCALATE (flagship/irreversible)', () => {
    const r = checkAdamOutbound(
      { body: 'Should we unpark the flagship venture?', kind: SOLOMON_CONSULT, addressee: 'chairman', expectsReply: true },
      { decision: escalateDecision },
    );
    expect(r.checks.shouldAnswer.pass).toBe(true);
  });
  it('is conservative when no decision signals are provided (no false over-answer flag)', () => {
    const r = checkAdamOutbound(
      { body: 'Should we unpark it?', kind: SOLOMON_CONSULT, addressee: 'chairman', expectsReply: true },
      {},
    );
    expect(r.checks.shouldAnswer.pass).toBe(true);
  });
  it('passes a non-question outbound trivially (shouldAnswer only gates questions)', () => {
    const r = checkAdamOutbound(
      { body: 'FYI the venture is parked.', kind: ADVISORY, addressee: 'chairman', expectsReply: false },
      { decision: execDecision },
    );
    expect(r.checks.shouldAnswer.pass).toBe(true);
  });
});

describe('solomonReview — Solomon-review check (FR-4 / TS-5)', () => {
  it('warns on a consequential (governance-derived) decision with no prior Solomon consult', () => {
    const r = checkAdamOutbound(
      { body: 'Proposing a new kill-gate policy because recurrence is high.', kind: ADVISORY },
      { decision: { governance: true }, solomonConsulted: false },
    );
    expect(r.checks.solomonReview.pass).toBe(false);
    expect(r.verdict).toBe('warn');
  });
  it('warns on an explicitly-consequential decision not yet consulted', () => {
    const r = checkAdamOutbound({ body: 'Because X, do Y.', kind: ADVISORY }, { consequential: true, solomonConsulted: false });
    expect(r.checks.solomonReview.pass).toBe(false);
  });
  it('EXEMPTS a solomon_consult-kind message (it IS the consult)', () => {
    const r = checkAdamOutbound({ body: 'Which option?', kind: SOLOMON_CONSULT }, { consequential: true, solomonConsulted: false });
    expect(r.checks.solomonReview.pass).toBe(true);
  });
  it('passes a consequential decision when Solomon was already consulted', () => {
    const r = checkAdamOutbound({ body: 'Because X, do Y.', kind: ADVISORY }, { consequential: true, solomonConsulted: true });
    expect(r.checks.solomonReview.pass).toBe(true);
  });
  it('passes a routine (non-consequential) outbound', () => {
    const r = checkAdamOutbound({ body: 'Because the run finished, closing out.', kind: ADVISORY }, { decision: { reversible: true, inRole: true } });
    expect(r.checks.solomonReview.pass).toBe(true);
  });
});

describe('aggregate verdict', () => {
  it('block outranks warn; a clean advisory passes all three', () => {
    const clean = checkAdamOutbound({ body: 'Recommend closing because the smoke test passed and no anchor remains.', kind: ADVISORY }, { decision: { reversible: true, inRole: true } });
    expect(clean.tripped).toBe(false);
    expect(clean.verdict).toBe('pass');
  });
});
