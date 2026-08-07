// SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001 FR-5.
//
// Measured before this SD: 0 of 62 LEAD-FINAL handoff rows carried metadata.gate_results, so
// FR_DELIVERY_VERIFICATION — the gate this SD was filed about — had NO persisted execution
// record for any of the 60 most recent completed SDs. Its verdict was unobservable to an
// auditor after the run, which is the same green-where-blind shape one level up: the gate
// could not be audited because it never recorded that it ran.
//
// These tests pin the projection shape so the verdict stays queryable.
import { describe, it, expect } from 'vitest';
import { projectGateResultsForPersistence } from '../../../scripts/modules/handoff/executors/lead-final-approval/index.js';

describe('projectGateResultsForPersistence', () => {
  it('returns [] rather than throwing on missing/!malformed input', () => {
    for (const bad of [undefined, null, {}, { gateResults: null }, { gateResults: 'nope' }]) {
      expect(projectGateResultsForPersistence(bad)).toEqual([]);
    }
  });

  it('projects name/score/passed/required per gate', () => {
    const out = projectGateResultsForPersistence({
      gateResults: {
        SMOKE_TEST: { score: 100, max_score: 100, passed: true, required: true },
        WIRE_CHECK: { score: 40, max_score: 100, passed: false, required: false },
      },
    });
    expect(out).toHaveLength(2);
    expect(out.find((g) => g.name === 'SMOKE_TEST')).toMatchObject({ score: 100, passed: true, required: true });
    expect(out.find((g) => g.name === 'WIRE_CHECK')).toMatchObject({ score: 40, passed: false, required: false });
  });

  it('carries the FR classification so an auditor can tell UNVERIFIABLE from UNDELIVERED', () => {
    // This is the whole point of FR-5: after the fact, "the gate scored low" is not enough.
    // The auditor must be able to distinguish "we looked and FRs were missing" from
    // "we could not see anything" WITHOUT re-running the gate.
    const [entry] = projectGateResultsForPersistence({
      gateResults: {
        FR_DELIVERY_VERIFICATION: {
          score: 0, max_score: 100, passed: true, required: false,
          details: {
            total: 6, delivered: 0, descoped: 0, undelivered: 0, unverifiable: 6,
            convention_in_use: false, over_ceiling: false,
            frs: [{ id: 'FR-1', description: 'a very long description '.repeat(40), status: 'unverifiable' }],
          },
        },
      },
    });
    expect(entry.fr_classification).toEqual({
      total: 6, delivered: 0, descoped: 0, undelivered: 0, unverifiable: 6,
      convention_in_use: false, over_ceiling: false,
    });
    // An all-unverifiable SD is distinguishable from an all-undelivered one from the row alone.
    expect(entry.fr_classification.unverifiable).toBe(6);
    expect(entry.fr_classification.undelivered).toBe(0);
  });

  it('does NOT persist the per-FR descriptions (row-bloat guard)', () => {
    const [entry] = projectGateResultsForPersistence({
      gateResults: {
        FR_DELIVERY_VERIFICATION: {
          score: 0, passed: true, required: false,
          details: { total: 1, unverifiable: 1, frs: [{ id: 'FR-1', description: 'SHOULD_NOT_APPEAR', status: 'unverifiable' }] },
        },
      },
    });
    expect(JSON.stringify(entry)).not.toContain('SHOULD_NOT_APPEAR');
    expect(entry.fr_classification.frs).toBeUndefined();
  });

  it('omits fr_classification for gates that carry no classification', () => {
    const [entry] = projectGateResultsForPersistence({
      gateResults: { RETROSPECTIVE_EXISTS: { score: 100, passed: true, required: true, details: { note: 'n/a' } } },
    });
    expect(entry.fr_classification).toBeUndefined();
  });

  it('tolerates the maxScore spelling used by the orchestrator', () => {
    const [entry] = projectGateResultsForPersistence({
      gateResults: { X: { score: 50, maxScore: 100, passed: true, required: false } },
    });
    expect(entry.max_score).toBe(100);
  });
});
