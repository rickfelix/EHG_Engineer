// SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (FR-2, TS-2/TS-3): the WARN-cap on
// experience-category findings. computeStage20Verdict() is the extracted pure
// verdict formula (lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js)
// — directly testable, unlike analyzeStage20CodeQuality() which requires
// cloneRepo/sandbox side effects.

import { describe, it, expect } from 'vitest';
import {
  computeStage20Verdict,
  WARN_CAPPED_CATEGORIES,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js';

describe('computeStage20Verdict — experience-category WARN cap', () => {
  it('a critical finding in each experience category cannot produce FAIL', () => {
    for (const category of WARN_CAPPED_CATEGORIES) {
      const verdict = computeStage20Verdict([{ check: category, severity: 'critical' }]);
      expect(verdict).not.toBe('FAIL');
    }
  });

  it('a critical finding in an experience category alongside only low/medium others still caps at PASS/WARN', () => {
    const verdict = computeStage20Verdict([
      { check: 'usability', severity: 'critical' },
      { check: 'lint', severity: 'low' },
      { check: 'npm_audit', severity: 'medium' },
    ]);
    expect(['PASS', 'WARN']).toContain(verdict);
  });

  it('a critical finding in a NON-experience category still produces FAIL (no regression)', () => {
    expect(computeStage20Verdict([{ check: 'npm_audit', severity: 'critical' }])).toBe('FAIL');
    expect(computeStage20Verdict([{ check: 'secrets', severity: 'critical' }])).toBe('FAIL');
    expect(computeStage20Verdict([{ check: 'lint', severity: 'critical' }])).toBe('FAIL');
  });

  it('a high finding in a NON-experience category still produces WARN (no regression)', () => {
    expect(computeStage20Verdict([{ check: 'test_suite', severity: 'high' }])).toBe('WARN');
  });

  it('no findings, or only low/medium findings, produces PASS', () => {
    expect(computeStage20Verdict([])).toBe('PASS');
    expect(computeStage20Verdict([{ check: 'lint', severity: 'low' }])).toBe('PASS');
    expect(computeStage20Verdict(undefined)).toBe('PASS');
  });

  it('mixed critical experience + critical non-experience still FAILs (the non-experience finding is not shielded)', () => {
    const verdict = computeStage20Verdict([
      { check: 'usability', severity: 'critical' },
      { check: 'npm_audit', severity: 'critical' },
    ]);
    expect(verdict).toBe('FAIL');
  });

  it('WARN_CAPPED_CATEGORIES matches exactly the three experience categories', () => {
    expect(WARN_CAPPED_CATEGORIES).toEqual(['usability', 'accessibility', 'journey_coherence']);
  });
});
