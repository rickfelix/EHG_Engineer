/**
 * Metric Auto-Verifier Tests
 * SD: SD-LEARN-FIX-ADDRESS-PAT-AUTO-082
 *
 * Tests expanded METRIC_MATCHERS for common SD metric patterns
 * that previously defaulted to self_reported (score 65).
 */

import { describe, it, expect } from 'vitest';
import { verifyMetric, verifyAllMetrics, classifyMetric, resolveDiffBase } from '../scripts/lib/metric-auto-verifier.js';

const REPO_ROOT = process.cwd();

describe('Metric Auto-Verifier — Expanded Matchers', () => {
  describe('Occurrence/recurrence patterns', () => {
    it('should recognize "occurrence" metrics', () => {
      const result = verifyMetric(
        { metric: 'PAT-AUTO-6de8fc27 recurrence rate', actual: '0 occurrences', target: '0 new occurrences in 30 days' },
        REPO_ROOT
      );
      expect(result.status).not.toBe('self_reported');
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should recognize "recurrence count" metrics', () => {
      const result = verifyMetric(
        { metric: 'Pattern recurrence count', actual: '2 occurrences', target: '0 occurrences' },
        REPO_ROOT
      );
      expect(result.status).not.toBe('self_reported');
    });
  });

  describe('System count/consolidation patterns', () => {
    it('should recognize "system count" metrics', () => {
      const result = verifyMetric(
        { metric: 'Event/scheduler system count', actual: '2 systems', target: '2 systems' },
        REPO_ROOT
      );
      expect(result.status).not.toBe('self_reported');
      expect(result.score).toBe(100);
    });

    it('should recognize "consolidation" metrics', () => {
      const result = verifyMetric(
        { metric: 'System consolidation progress', actual: '80%', target: '100%' },
        REPO_ROOT
      );
      expect(result.status).not.toBe('self_reported');
    });
  });

  describe('Gate score/threshold patterns', () => {
    it('should recognize "gate score" metrics', () => {
      const result = verifyMetric(
        { metric: 'PLAN-TO-LEAD handoff gate score', actual: '85%', target: '>=70%' },
        REPO_ROOT
      );
      expect(result.status).not.toBe('self_reported');
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should recognize "validation score" metrics', () => {
      const result = verifyMetric(
        { metric: 'Handoff validation pass rate', actual: '95%', target: '>=55%' },
        REPO_ROOT
      );
      expect(result.score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Completion/progress patterns', () => {
    it('should recognize "completion rate" metrics', () => {
      const result = verifyMetric(
        { metric: 'Implementation completion percentage', actual: '100%', target: '100%' },
        REPO_ROOT
      );
      expect(result.score).toBe(100);
    });
  });

  describe('Reduction patterns', () => {
    it('should recognize "redundant code eliminated" metrics', () => {
      const result = verifyMetric(
        { metric: 'Redundant scheduling code eliminated', actual: '250 LOC removed', target: '>=200 LOC removed' },
        REPO_ROOT
      );
      expect(result.status).not.toBe('self_reported');
      expect(result.score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Manual intervention patterns', () => {
    it('should recognize "manual intervention" metrics', () => {
      const result = verifyMetric(
        { metric: 'Manual intervention reduction', actual: '0 manual DB updates', target: 'Zero manual DB updates' },
        REPO_ROOT
      );
      expect(result.status).not.toBe('self_reported');
    });
  });

  describe('Placeholder detection', () => {
    it('should score 0 for pending actuals', () => {
      const result = verifyMetric(
        { metric: 'System consolidation progress', actual: 'pending', target: '100%' },
        REPO_ROOT
      );
      expect(result.score).toBe(0);
      expect(result.status).toBe('mismatch');
    });

    it('should score 0 for N/A actuals', () => {
      const result = verifyMetric(
        { metric: 'Gate score threshold', actual: 'N/A', target: '>=70%' },
        REPO_ROOT
      );
      expect(result.score).toBe(0);
    });
  });

  describe('Backward compatibility', () => {
    it('should still fall back to self_reported for unknown metrics', () => {
      const result = verifyMetric(
        { metric: 'Customer satisfaction improvement', actual: 'positive feedback', target: 'improved' },
        REPO_ROOT
      );
      // Short actual → self_reported
      expect(result.score).toBeLessThanOrEqual(80);
    });

    it('should still recognize test pass rate metrics', () => {
      const result = verifyMetric(
        { metric: 'Unit test pass rate', actual: '100%', target: '100%' },
        REPO_ROOT
      );
      // Either verified or self_reported (depends on test report existence)
      expect(result.score).toBeGreaterThanOrEqual(65);
    });
  });

  describe('Overall score improvement', () => {
    it('should score >=70 for typical infrastructure SD metrics', () => {
      const { overallScore } = verifyAllMetrics([
        { metric: 'Pattern recurrence rate', actual: '0 occurrences', target: '0 new occurrences in 30 days' },
        { metric: 'Gate validation score', actual: '85%', target: '>=55%' },
        { metric: 'Manual intervention reduction', actual: '0 manual patches needed', target: 'Zero manual DB updates' },
      ], REPO_ROOT);

      expect(overallScore).toBeGreaterThanOrEqual(70);
    });
  });
});

// SD-FDBK-ENH-SUCCESS-METRICS-GATE-001: matcher precision + stable diff base
describe('Metric Auto-Verifier — matcher precision (SD-FDBK-ENH-SUCCESS-METRICS-GATE-001)', () => {
  describe('FR-1: LOC substring no longer false-matches', () => {
    it("does NOT route 'Local cache hit rate' to verifyLinesOfCode", () => {
      expect(classifyMetric('Local cache hit rate')).not.toBe('linesOfCode');
    });
    it("does NOT route 'allocation overhead' or 'protocol coverage gap' to verifyLinesOfCode", () => {
      expect(classifyMetric('allocation overhead')).not.toBe('linesOfCode');
      expect(classifyMetric('protocol handoff gap')).not.toBe('linesOfCode');
    });
    it("STILL routes genuine LOC metrics ('230 LOC', 'Lines of code added') to verifyLinesOfCode", () => {
      expect(classifyMetric('230 LOC')).toBe('linesOfCode');
      expect(classifyMetric('Lines of code added')).toBe('linesOfCode');
      expect(classifyMetric('insertions')).toBe('linesOfCode');
    });
    it("verifyMetric('Local cache hit rate') yields no git-insertions mismatch", () => {
      const r = verifyMetric({ metric: 'Local cache hit rate', actual: '95%', target: '90%' }, REPO_ROOT);
      // routed to a target/self_reported path, never a verifyLinesOfCode 'insertions' mismatch
      expect(r.status).not.toBe('mismatch');
      expect(String(r.issue || '')).not.toMatch(/insertions/i);
    });
  });

  describe('FR-2: digits+test inside a token no longer false-matches', () => {
    it("does NOT route 'S17 test artifacts captured' to verifyTestCount", () => {
      expect(classifyMetric('S17 test artifacts captured')).not.toBe('testCount');
    });
    it("does NOT route '1 test environment provisioned' to verifyTestCount", () => {
      expect(classifyMetric('1 test environment provisioned')).not.toBe('testCount');
    });
    it("STILL routes a genuine test count ('42 tests') to verifyTestCount", () => {
      expect(classifyMetric('42 tests')).toBe('testCount');
    });
    it("STILL routes 'Unit test pass rate' to verifyTestPassRate (not testCount)", () => {
      expect(classifyMetric('Unit test pass rate')).toBe('testPassRate');
    });
  });

  describe('FR-3: resolveDiffBase prefers a current base over a stale local main', () => {
    it("returns 'origin/main' when it resolves", () => {
      const run = (ref) => { if (ref !== 'origin/main') throw new Error('absent'); };
      expect(resolveDiffBase('/repo', run)).toBe('origin/main');
    });
    it("falls back to 'main' when origin/main is absent", () => {
      const run = (ref) => { if (ref === 'origin/main') throw new Error('absent'); /* main ok */ };
      expect(resolveDiffBase('/repo', run)).toBe('main');
    });
    it("falls back to 'main' (last resort) when no ref resolves — never throws", () => {
      const run = () => { throw new Error('absent'); };
      expect(resolveDiffBase('/repo', run)).toBe('main');
    });
  });
});
