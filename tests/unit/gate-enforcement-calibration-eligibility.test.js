// QF-20260611-510 (chairman ruling, sitting #1 item 2, 2026-06-11): ventures
// classified workflow_scaffold (CronLinter, Canvas-AI — gates deliberately
// forced during build-out) must be excluded from gate-calibration analytics.
// Pins the canonical predicate at the enforcement seam so the
// SD-MAN-INFRA-GATE-BAR-REGIME-001 calibration queries have ONE filter to use.

import { describe, it, expect } from 'vitest';
import {
  SCAFFOLD_CLASSIFICATION,
  isCalibrationEligibleVenture,
  GATE_ENFORCEMENT,
  classifyGateRow,
} from '../../lib/eva/gate-enforcement.js';

describe('SCAFFOLD_CLASSIFICATION constant', () => {
  it('matches the chairman-ratified classification value', () => {
    expect(SCAFFOLD_CLASSIFICATION).toBe('workflow_scaffold');
  });
});

describe('isCalibrationEligibleVenture', () => {
  it('EXCLUDES a workflow_scaffold venture (the CronLinter/Canvas-AI shape)', () => {
    expect(isCalibrationEligibleVenture({
      metadata: { venture_classification: 'workflow_scaffold', classification_basis: 'sitting #1 item 2' },
    })).toBe(false);
  });

  it('includes a normal venture (no classification)', () => {
    expect(isCalibrationEligibleVenture({ metadata: {} })).toBe(true);
  });

  it('includes a venture with a different classification', () => {
    expect(isCalibrationEligibleVenture({ metadata: { venture_classification: 'real' } })).toBe(true);
  });

  it('includes when metadata is missing entirely (fail-open: never silently drops real data)', () => {
    expect(isCalibrationEligibleVenture({})).toBe(true);
    expect(isCalibrationEligibleVenture(null)).toBe(true);
    expect(isCalibrationEligibleVenture(undefined)).toBe(true);
  });
});

describe('existing enforcement semantics untouched', () => {
  it('GATE_ENFORCEMENT mapping unchanged (kill/exit blocking, entry advisory)', () => {
    expect(GATE_ENFORCEMENT).toEqual({ kill: 'blocking', exit: 'blocking', entry: 'advisory' });
  });

  it('classifyGateRow defaults unknown types to advisory', () => {
    expect(classifyGateRow({ gate_type: 'mystery' })).toBe('advisory');
  });
});
