/**
 * SD-PAT-FIX-STUBBED-WRITER-BLINDNESS-001 (FR-1 / TS-6) — REAL_CALLEE_ATTESTATION gate.
 *
 * THE POINT OF THIS FILE, stated because it is easy to write the useless version: a presence-check
 * gate implemented as `return true` passes every "present" case identically to a correct one. So the
 * MISSING case asserts the gate's ACTUAL return value (passed === false, plus a distinguishing reason
 * code), not merely that a run completed. Alongside it sits an explicit gut check confirming a
 * always-true gate FAILS that assertion — without which "present passes" carries no information.
 *
 * That is the same discipline this whole SD exists to install: an assertion of acceptance is only
 * evidence if something in the same file proves the check can reject.
 */

import { describe, it, expect } from 'vitest';
import {
  createRealCalleeAttestationGate,
  classifyAttestation,
} from '../../../scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js';

const gate = createRealCalleeAttestationGate();
const runWith = (metadata) => gate.validator({ sd: { sd_key: 'SD-TEST-001', metadata } });

describe('REAL_CALLEE_ATTESTATION — presence, never content', () => {
  it('TS-6a: an ABSENT field FAILS with a distinguishing reason code', async () => {
    // The load-bearing assertion. If this only checked "a result came back", a `return true` gate
    // would satisfy it.
    const r = await runWith({});
    expect(r.passed).toBe(false);
    expect(r.details.reason).toBe('ATTESTATION_MISSING');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatch(/real_callee_attestation/);
  });

  it('TS-6b: the literal "none" PASSES — declaring it untested is a valid answer', async () => {
    const r = await runWith({ real_callee_attestation: 'none' });
    expect(r.passed).toBe(true);
    expect(r.details.declared_none).toBe(true);
    // Recorded as a warning so it stays visible rather than reading as ordinary success.
    expect(r.warnings.join(' ')).toMatch(/UNTESTED/);
  });

  it('TS-6c: arbitrary content PASSES and is NOT judged', async () => {
    const r = await runWith({
      real_callee_attestation: ['recordDisposition -> tests/unit/decision-binding-disposition.test.js'],
    });
    expect(r.passed).toBe(true);
    expect(r.details.entries).toBe(1);
    expect(r.issues).toHaveLength(0);
  });

  it('TS-6d: obviously low-quality content still PASSES — content is deliberately out of scope', async () => {
    // A gate that started grading answers would be guessing, would be argued with, and would get
    // bypassed. This pins that non-behaviour so nobody "improves" it into a quality judge.
    const r = await runWith({ real_callee_attestation: 'asdf' });
    expect(r.passed).toBe(true);
  });

  it('an EMPTY string or empty array is an absent answer wearing the shape of one', async () => {
    expect((await runWith({ real_callee_attestation: '   ' })).passed).toBe(false);
    expect((await runWith({ real_callee_attestation: [] })).passed).toBe(false);
    expect((await runWith({ real_callee_attestation: ['  ', null] })).passed).toBe(false);
    expect((await runWith({ real_callee_attestation: {} })).passed).toBe(false);
  });

  it('is NON-BLOCKING this increment', async () => {
    expect(gate.required).toBe(false);
  });
});

describe('the gate can actually reject — otherwise "present passes" proves nothing', () => {
  const ALWAYS_TRUE = { validator: async () => ({ passed: true, score: 100, max_score: 100, issues: [], warnings: [] }) };

  it('a stub always-true gate PASSES the missing-field input that the real gate FAILS', async () => {
    const stubResult = await ALWAYS_TRUE.validator({ sd: { metadata: {} } });
    const realResult = await runWith({});
    expect(stubResult.passed).toBe(true);   // the useless implementation
    expect(realResult.passed).toBe(false);  // the real one
    // Asserting they DIFFER is what makes every "passes" assertion above meaningful.
    expect(realResult.passed).not.toBe(stubResult.passed);
  });
});

describe('classifyAttestation (pure core)', () => {
  it('separates missing, empty and present without touching a database', () => {
    expect(classifyAttestation(undefined).reason).toBe('ATTESTATION_MISSING');
    expect(classifyAttestation(null).reason).toBe('ATTESTATION_MISSING');
    expect(classifyAttestation(42).reason).toBe('ATTESTATION_MISSING');
    expect(classifyAttestation('').reason).toBe('ATTESTATION_EMPTY');
    expect(classifyAttestation('none').declaredNone).toBe(true);
    expect(classifyAttestation('NONE').declaredNone).toBe(true);
    expect(classifyAttestation(['a', 'b']).entries).toBe(2);
    expect(classifyAttestation({ writeX: 'test-y' }).entries).toBe(1);
  });
});
