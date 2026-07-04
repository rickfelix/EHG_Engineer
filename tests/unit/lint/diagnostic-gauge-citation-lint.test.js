/**
 * SD-LEO-INFRA-REWARD-SPINE-ONE-001-C — regex-level unit coverage for
 * scripts/lint/diagnostic-gauge-citation-patterns.mjs's citation detector, since the lint CLI's
 * behavior (--all against the real repo) is exercised directly in the SD's smoke test, not here.
 */
import { describe, it, expect } from 'vitest';
import { QUALITY_SCORE_RE, ADHERENCE_OR_GATE_PASS_RATE_RE } from '../../../scripts/lint/diagnostic-gauge-citation-patterns.mjs';

describe('diagnostic-gauge-citation-lint: QUALITY_SCORE_RE', () => {
  it('matches a numeric threshold on retrospective.quality_score', () => {
    expect(QUALITY_SCORE_RE.test('if (retrospective.quality_score >= 60) {')).toBe(true);
  });

  it('matches optional-chained access', () => {
    expect(QUALITY_SCORE_RE.test('retro?.quality_score < 70')).toBe(true);
  });

  it('matches feedback.quality_score too (same process-proxy pattern)', () => {
    expect(QUALITY_SCORE_RE.test('if (feedback.quality_score != null && feedback.quality_score < 40) {')).toBe(true);
  });

  it('does not match a bare mention with no comparison', () => {
    expect(QUALITY_SCORE_RE.test('console.log(retro.quality_score);')).toBe(false);
  });
});

describe('diagnostic-gauge-citation-lint: ADHERENCE_OR_GATE_PASS_RATE_RE', () => {
  it('matches a compound gate-pass-rate threshold', () => {
    expect(ADHERENCE_OR_GATE_PASS_RATE_RE.test('gateAlert.pass_rate < 50')).toBe(true);
  });

  it('matches a compound adherence-pass-rate threshold', () => {
    expect(ADHERENCE_OR_GATE_PASS_RATE_RE.test('if (adherenceProbe.passRate >= 90) {')).toBe(true);
  });

  it('does NOT match a bare passRate/pass_rate with no adherence/gate qualifier (the false-positive class found in --all research)', () => {
    expect(ADHERENCE_OR_GATE_PASS_RATE_RE.test('const qualityBadge = passRate === 100 ? "y" : "n";')).toBe(false);
    expect(ADHERENCE_OR_GATE_PASS_RATE_RE.test('if (testEvidence?.pass_rate >= 80) {')).toBe(false);
  });
});
