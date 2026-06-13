/**
 * SD-FDBK-FIX-GATE-PIPELINE-GATE1-001 — gate-pipeline GATE1 key-drift + GATE4 placement.
 *
 * (B) GATE1 KEY DRIFT: the live PLAN-TO-EXEC gate is GATE1_DESIGN_DATABASE (gate_results keyed by
 *     gate.name); GATE1_PRD_QUALITY was never emitted, so GATE4's reader never found gate1.
 *     creditGatesFromHandoffs (reader) + HandoffRecorder (writer) now recognize the live key.
 * (A) GATE4 MISPLACEMENT: createWorkflowROIGate (GATE4_WORKFLOW_ROI) ran as a BLOCKING executor
 *     gate at PLAN-TO-LEAD (one phase too early). It is REMOVED from PLAN-TO-LEAD. GATE4 already
 *     runs at LEAD-FINAL via the validator-registry DB rules (leo_validation_rules gate='4',
 *     handoff_type='LEAD-FINAL-APPROVAL') — so the LFA executor must NOT push it again (double-run).
 *
 * Tests bind to the REAL exported functions; the adversarial review of this diff caught a
 * double-run (the original draft pushed GATE4 at LFA on top of the registry) — these tests pin
 * the corrected behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creditGatesFromHandoffs } from '../../scripts/modules/workflow-roi-validation.js';
import { getRequiredGates } from '../../scripts/modules/handoff/executors/lead-final-approval/gates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAN_TO_LEAD = resolve(__dirname, '../../scripts/modules/handoff/executors/plan-to-lead/index.js');
const HANDOFF_RECORDER = resolve(__dirname, '../../scripts/modules/handoff/recording/HandoffRecorder.js');

const freshAcc = () => ({ gateResults: {}, acceptedHandoffs: {}, gateDataSources: {} });

describe('(B) GATE1 key drift — creditGatesFromHandoffs (reader)', () => {
  it('credits gate1 from the LIVE GATE1_DESIGN_DATABASE key (the drift fix)', () => {
    const acc = freshAcc();
    creditGatesFromHandoffs([
      { handoff_type: 'PLAN-TO-EXEC', status: 'accepted', metadata: { gate_results: { GATE1_DESIGN_DATABASE: { score: 92, passed: true } } } },
    ], acc);
    expect(acc.gateResults.gate1).toEqual({ score: 92, passed: true });
    expect(acc.gateDataSources.gate1).toBe('canonical');
    expect(acc.acceptedHandoffs.gate1).toBe(true);
  });

  it('still credits gate1 from the legacy GATE1_PRD_QUALITY canonical key (back-compat)', () => {
    const acc = freshAcc();
    creditGatesFromHandoffs([
      { handoff_type: 'PLAN-TO-EXEC', status: 'accepted', metadata: { gate_results: { GATE1_PRD_QUALITY: { score: 88 } } } },
    ], acc);
    expect(acc.gateResults.gate1).toEqual({ score: 88 });
    expect(acc.gateDataSources.gate1).toBe('canonical');
  });

  it('still credits gate1 from the legacy gate1_validation mirror', () => {
    const acc = freshAcc();
    creditGatesFromHandoffs([
      { handoff_type: 'PLAN-TO-EXEC', status: 'accepted', metadata: { gate1_validation: { score: 77 } } },
    ], acc);
    expect(acc.gateResults.gate1).toEqual({ score: 77 });
    expect(acc.gateDataSources.gate1).toBe('legacy');
  });

  it('does NOT credit gate1 from an UNRECOGNIZED gate_results key (recognition-set guard)', () => {
    // The exact bug class the SD remediates: an unknown key must surface as an undercount
    // (gate1 undefined) loudly, not be silently mis-credited.
    const acc = freshAcc();
    creditGatesFromHandoffs([
      { handoff_type: 'PLAN-TO-EXEC', status: 'accepted', metadata: { gate_results: { GATE1_SOME_FUTURE_RENAME: { score: 91 } } } },
    ], acc);
    expect(acc.gateResults.gate1).toBeUndefined();
    expect(acc.gateDataSources.gate1).toBeUndefined();
    expect(acc.acceptedHandoffs.gate1).toBe(true); // acceptance still credited; score not mis-credited
  });

  it('does NOT credit acceptance for a non-accepted handoff (status guard)', () => {
    const acc = freshAcc();
    creditGatesFromHandoffs([
      { handoff_type: 'PLAN-TO-EXEC', status: 'rejected', metadata: { gate_results: { GATE1_DESIGN_DATABASE: { score: 90 } } } },
    ], acc);
    expect(acc.acceptedHandoffs.gate1).toBeFalsy();
    expect(acc.gateResults.gate1).toEqual({ score: 90 }); // value credit is status-independent
  });

  it('first matching handoff in the list wins the gate1 value (caller passes newest first)', () => {
    const acc = freshAcc();
    creditGatesFromHandoffs([
      { handoff_type: 'PLAN-TO-EXEC', status: 'accepted', metadata: { gate_results: { GATE1_DESIGN_DATABASE: { score: 99 } } } },
      { handoff_type: 'PLAN-TO-EXEC', status: 'accepted', metadata: { gate_results: { GATE1_DESIGN_DATABASE: { score: 11 } } } },
    ], acc);
    expect(acc.gateResults.gate1).toEqual({ score: 99 });
  });

  it('credits gate2 and gate3 from their canonical keys (behavior preserved)', () => {
    const acc = freshAcc();
    creditGatesFromHandoffs([
      { handoff_type: 'EXEC-TO-PLAN', status: 'accepted', metadata: { gate_results: { GATE2_IMPLEMENTATION_FIDELITY: { score: 95 } } } },
      { handoff_type: 'PLAN-TO-LEAD', status: 'accepted', metadata: { gate_results: { GATE3_TRACEABILITY: { score: 100 } } } },
    ], acc);
    expect(acc.gateResults.gate2).toEqual({ score: 95 });
    expect(acc.gateResults.gate3).toEqual({ score: 100 });
    expect(acc.acceptedHandoffs.gate2).toBe(true);
    expect(acc.acceptedHandoffs.gate3).toBe(true);
  });

  it('credits acceptance when the gate value is absent, and tolerates an empty/undefined list', () => {
    const acc = freshAcc();
    creditGatesFromHandoffs([{ handoff_type: 'PLAN-TO-EXEC', status: 'accepted', metadata: {} }], acc);
    expect(acc.acceptedHandoffs.gate1).toBe(true);
    expect(acc.gateResults.gate1).toBeUndefined();
    expect(() => creditGatesFromHandoffs(undefined, freshAcc())).not.toThrow();
  });
});

describe('(A) GATE4 placement — PLAN-TO-LEAD removal + no LFA double-push (wiring guards)', () => {
  const p2lSrc = readFileSync(PLAN_TO_LEAD, 'utf8');
  const stubSupabase = {};
  const stubPrdRepo = {};

  it('the PLAN-TO-LEAD executor no longer pushes createWorkflowROIGate (GATE4 removed)', () => {
    expect(p2lSrc).not.toMatch(/^\s*gates\.push\(createWorkflowROIGate/m);
  });

  it('the PLAN-TO-LEAD executor still pushes the GATE3 traceability gate', () => {
    expect(p2lSrc).toMatch(/gates\.push\(createTraceabilityGate/);
  });

  it('LEAD-FINAL getRequiredGates does NOT push GATE4_WORKFLOW_ROI (registry already runs it — no double-run)', () => {
    for (const sd of [{ sd_key: 'SD-SEC-001', sd_type: 'feature' }, { sd_key: 'SD-FIX-001', sd_type: 'bugfix' }, null]) {
      const names = getRequiredGates(stubSupabase, stubPrdRepo, sd).map(g => g.name);
      expect(names).not.toContain('GATE4_WORKFLOW_ROI');
    }
  });
});

describe('(B) GATE1 key drift — HandoffRecorder writer mirror', () => {
  // The recorder's PLAN-TO-EXEC block mirrors gate1 into metadata.gate1_validation (the legacy
  // fallback the GATE4 reader uses). Source-pin that it recognizes the live key + back-compat,
  // so a revert to GATE1_PRD_QUALITY-only is caught.
  const recSrc = readFileSync(HANDOFF_RECORDER, 'utf8');

  it('the writer recognizes the live GATE1_DESIGN_DATABASE key with GATE1_PRD_QUALITY back-compat', () => {
    expect(recSrc).toMatch(/result\.gateResults\.GATE1_DESIGN_DATABASE\s*\|\|\s*result\.gateResults\.GATE1_PRD_QUALITY/);
    expect(recSrc).toMatch(/metadata\.gate1_validation\s*=\s*gate1/);
  });

  it('the writer still persists the full gate_results map (the GATE4 reader canonical path)', () => {
    expect(recSrc).toMatch(/metadata\.gate_results\s*=\s*result\.gateResults/);
  });
});
