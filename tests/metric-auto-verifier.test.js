/**
 * Metric Auto-Verifier Tests
 * SD: SD-LEARN-FIX-ADDRESS-PAT-AUTO-082
 *
 * Tests expanded METRIC_MATCHERS for common SD metric patterns
 * that previously defaulted to self_reported (score 65).
 */

import { describe, it, expect } from 'vitest';
import { verifyMetric, verifyAllMetrics } from '../scripts/lib/metric-auto-verifier.js';

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
