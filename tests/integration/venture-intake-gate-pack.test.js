/**
 * Integration pins: the venture-intake gate pack COMPOSES onto the live substrate
 * (gate-bars S3/S23/S25 + Stage-1 intake bar) without replacing it, and never blocks.
 * SD-LEO-INFRA-VENTURE-INTAKE-GATE-PACK-001 — FR-3/FR-5/FR-6.
 */
import { describe, it, expect } from 'vitest';
import { evaluateGateBars } from '../../lib/eva/gate-bars.js';
import { evaluateIntakeBar } from '../../lib/discovery/intake-bar.js';
import { evaluateIntakeGates } from '../../lib/eva/venture-intake-gates.js';

const EVIDENCE_BARS_S3 = ['criteria_present', 'score_present', 'evidence_resolvable', 's3_web_grounding'];

describe('compose-not-replace onto gate-bars (FR-3)', () => {
  it('S3: existing evidence bars STILL fire, and G1/G3/G4 are appended', async () => {
    const ev = await evaluateGateBars({ stage_number: 3, gate_criteria: { foo: 'bar' } });
    const names = ev.bars.map((b) => b.bar);
    for (const b of EVIDENCE_BARS_S3) expect(names).toContain(b); // existing bars intact
    expect(names).toContain('intake_G1');
    expect(names).toContain('intake_G3');
    expect(names).toContain('intake_G4');
  });

  it('S23 + S25: G2 is appended; a non-chairman stage gets no intake gates', async () => {
    for (const stage of [23, 25]) {
      const ev = await evaluateGateBars({ stage_number: stage, gate_criteria: {} });
      expect(ev.bars.map((b) => b.bar)).toContain('intake_G2');
    }
    const offStage = await evaluateGateBars({ stage_number: 99, gate_criteria: {} });
    expect(offStage.in_scope).toBe(false);
    expect(offStage.bars.map((b) => b.bar)).not.toContain('intake_G2');
  });

  it('all_pass stays the gate-bar regime verdict (evidence-only) — a FAILING intake gate does NOT flip it', async () => {
    // gate_criteria present + numeric score + a resolvable UUID + a live-checkable URL → all evidence bars pass.
    const row = {
      stage_number: 3,
      overall_score: 88,
      gate_criteria: { note: 'see https://example.com/proof and ref 11111111-2222-3333-4444-555555555555' },
    };
    const ev = await evaluateGateBars(row, { resolveArtifact: async () => true, checkUrl: async () => true });
    // The appended intake gates (no distribution_channel/why_now/etc.) FAIL, but all_pass ignores them:
    expect(ev.bars.some((b) => b.bar.startsWith('intake_') && b.status === 'fail')).toBe(true);
    expect(ev.all_pass).toBe(true); // evidence bars all passed → verdict unchanged by the intake pack
    expect(ev.advisory).toBe(true); // observe-only
  });
});

describe('compose onto the Stage-1 intake bar (FR-3/FR-6)', () => {
  it('the 7-point intake bar still fires unchanged; G5/G6 ride as a separate observe-only block', () => {
    const ib = evaluateIntakeBar({ moat: 'compounding proprietary dataset', monetization_shape: 'usage' });
    expect(ib.max).toBe(7); // ratified 7-point contract intact (no regression)
    expect(ib.checks).toHaveLength(7);
    expect(ib.advisory).toBe(true);
    expect(ib.intake_gates_observe_only).toBe(true);
    expect(Object.keys(ib.intake_gates)).toEqual(['G5', 'G6']);
    expect(ib.intake_gates.G5.status).toBe('pass');
    expect(ib.intake_gates.G6.status).toBe('pass');
  });
});

describe('venture #1 is NOT blocked (FR-5)', () => {
  it('evaluating at S3/S23/S25 + intake bar + the pack emits NO blocking/kill/promotion verdict', async () => {
    // A venture that FAILS every intake gate must still not be blocked — observe-only records only.
    const empty = {};
    for (const stage of [3, 23, 25]) {
      const ev = await evaluateGateBars({ stage_number: stage, gate_criteria: empty });
      expect(ev.advisory).toBe(true); // never converts a bar verdict into a block
    }
    const ib = evaluateIntakeBar(empty);
    expect(ib.advisory).toBe(true);
    expect(ib.intake_gates_observe_only).toBe(true);
    // The pack itself, even at a binding-eligible cohort, yields no verdict (dormant):
    const pack = evaluateIntakeGates(empty, { cohortSize: 9 });
    expect(pack.verdict).toBeNull();
  });
});
