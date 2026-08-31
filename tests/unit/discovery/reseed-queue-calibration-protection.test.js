/**
 * SD-LEO-INFRA-SEED-OPPORTUNITY-BLUEPRINTS-001 (VALIDATION finding, evidence cf18a4ae)
 *
 * scripts/discovery/reseed-queue.mjs previously archived EVERY is_active=true opportunity_blueprints
 * row unconditionally, regardless of classify() -- one --apply run would silently re-zero the
 * vision gauge's "Calibrate the gates" probe. isCalibrationProtected()/partitionByCalibration()
 * exclude any row already read by the calibration cohort from the archival sweep.
 */
import { describe, it, expect } from 'vitest';
import { classify, isCalibrationProtected, partitionByCalibration } from '../../../scripts/discovery/reseed-queue.mjs';

describe('classify (pre-existing, unchanged)', () => {
  it('classifies an E2E-titled row as e2e_fixture', () => {
    expect(classify({ title: 'E2E Test: foo', source_type: 'ai_generated' })).toBe('e2e_fixture');
  });

  it('classifies a source_type=manual row as e2e_fixture', () => {
    expect(classify({ title: 'Anything', source_type: 'manual' })).toBe('e2e_fixture');
  });

  it('classifies anything else as real_idea', () => {
    expect(classify({ title: 'Reconsider: X', source_type: 'ai_generated' })).toBe('real_idea');
  });
});

describe('isCalibrationProtected (new)', () => {
  it('is true when metadata.calibration_read_at is set', () => {
    expect(isCalibrationProtected({ metadata: { calibration_read_at: '2026-08-30T22:51:36.826Z' } })).toBe(true);
  });

  it('is false when calibration_read_at is absent', () => {
    expect(isCalibrationProtected({ metadata: { calibration_cohort: true } })).toBe(false);
  });

  it('is false for a row with no metadata at all', () => {
    expect(isCalibrationProtected({})).toBe(false);
    expect(isCalibrationProtected(null)).toBe(false);
  });
});

describe('partitionByCalibration (new)', () => {
  it('splits calibrated rows into protectedRows and the rest into sweepable', () => {
    const calibrated = { id: 'c1', metadata: { calibration_read_at: '2026-08-30T22:00:00Z' } };
    const uncalibrated = { id: 'u1', metadata: {} };
    const { protectedRows, sweepable } = partitionByCalibration([calibrated, uncalibrated]);
    expect(protectedRows).toEqual([calibrated]);
    expect(sweepable).toEqual([uncalibrated]);
  });

  it('TS-5 (VALIDATION-corrected): a real mutation case -- a row that is is_active=false-eligible AND calibrated is still excluded from sweep, proving the calibration filter (not is_active) does the exclusion', () => {
    const seededAndArchivable = { id: 'seed-1', metadata: { calibration_read_at: '2026-08-30T22:51:36.826Z', calibration_cohort: true } };
    const { protectedRows, sweepable } = partitionByCalibration([seededAndArchivable]);
    expect(protectedRows).toEqual([seededAndArchivable]);
    expect(sweepable).toEqual([]);
  });

  it('returns empty arrays for an empty/undefined input', () => {
    expect(partitionByCalibration([])).toEqual({ protectedRows: [], sweepable: [] });
    expect(partitionByCalibration(undefined)).toEqual({ protectedRows: [], sweepable: [] });
  });
});
