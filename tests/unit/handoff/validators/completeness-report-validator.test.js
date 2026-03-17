import { describe, it, expect } from 'vitest';
import { validateCompletenessReport } from '../../../../scripts/modules/handoff/validators/completeness-report-validator.js';

describe('validateCompletenessReport', () => {
  it('returns all issues when handoff is missing', async () => {
    const result = await validateCompletenessReport({});
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(100);
    expect(result.issues).toContain('completeness_report missing phase');
    expect(result.issues).toContain('completeness_report missing score');
    expect(result.issues).toContain('completeness_report missing status');
  });

  it('returns score 0 when report is empty object', async () => {
    const result = await validateCompletenessReport({ handoff: { completeness_report: {} } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues).toHaveLength(3);
  });

  it('returns partial score when only phase is present', async () => {
    const result = await validateCompletenessReport({
      handoff: { completeness_report: { phase: 'EXEC' } }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(33); // 1/3 * 100
    expect(result.issues).toContain('completeness_report missing score');
    expect(result.issues).toContain('completeness_report missing status');
    expect(result.details.hasPhase).toBe(true);
    expect(result.details.hasScore).toBe(false);
    expect(result.details.hasStatus).toBe(false);
  });

  it('returns partial score when only score is present', async () => {
    const result = await validateCompletenessReport({
      handoff: { completeness_report: { score: 85 } }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(33);
    expect(result.issues).toContain('completeness_report missing phase');
    expect(result.issues).toContain('completeness_report missing status');
  });

  it('returns partial score when two fields present', async () => {
    const result = await validateCompletenessReport({
      handoff: { completeness_report: { phase: 'PLAN', status: 'complete' } }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(67); // 2/3 * 100
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toContain('completeness_report missing score');
  });

  it('warns when score is not a number', async () => {
    const result = await validateCompletenessReport({
      handoff: { completeness_report: { phase: 'EXEC', score: 'high', status: 'complete' } }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings).toContain('completeness_report.score should be a number');
  });

  it('returns score 100 when all fields present', async () => {
    const result = await validateCompletenessReport({
      handoff: {
        completeness_report: { phase: 'EXEC', score: 95, status: 'complete' }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.details.hasPhase).toBe(true);
    expect(result.details.hasScore).toBe(true);
    expect(result.details.hasStatus).toBe(true);
    expect(result.details.phase).toBe('EXEC');
    expect(result.details.score).toBe(95);
    expect(result.details.status).toBe('complete');
  });

  it('accepts score of 0 as valid (not missing)', async () => {
    const result = await validateCompletenessReport({
      handoff: {
        completeness_report: { phase: 'LEAD', score: 0, status: 'failed' }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.hasScore).toBe(true);
  });
});
