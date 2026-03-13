import { describe, it, expect } from 'vitest';
import {
  validatePhaseCoverage,
  detectOrphanChildren,
  formatCoverageReport
} from '../../scripts/modules/handoff/validation/phase-coverage-validator.js';

describe('Orchestrator Scope Governance', () => {
  describe('detectOrphanChildren', () => {
    const phases = [
      { number: 1, title: 'Database Migration', child_designation: 'A' },
      { number: 2, title: 'API Implementation', child_designation: 'B' },
      { number: 3, title: 'Frontend Integration', child_designation: 'C' }
    ];

    it('returns empty orphans when no children exist', () => {
      const result = detectOrphanChildren(phases, []);
      expect(result.orphans).toEqual([]);
      expect(result.checkedCount).toBe(0);
    });

    it('returns empty orphans when all children reference valid phases', () => {
      const children = [
        { sd_key: 'SD-TEST-001-A', title: 'Phase 1: Database Migration', status: 'draft', parent_sd_id: 'uuid-1' },
        { sd_key: 'SD-TEST-001-B', title: 'Phase 2: API Implementation', status: 'draft', parent_sd_id: 'uuid-1' }
      ];
      const result = detectOrphanChildren(phases, children);
      expect(result.orphans).toEqual([]);
      expect(result.checkedCount).toBe(2);
    });

    it('detects orphan child referencing non-existent phase number', () => {
      const children = [
        { sd_key: 'SD-TEST-001-A', title: 'Phase 1: Database Migration', status: 'draft', parent_sd_id: 'uuid-1' },
        { sd_key: 'SD-TEST-001-D', title: 'Phase 5: Monitoring Setup', status: 'draft', parent_sd_id: 'uuid-1' }
      ];
      const result = detectOrphanChildren(phases, children);
      expect(result.orphans).toHaveLength(1);
      expect(result.orphans[0].sd_key).toBe('SD-TEST-001-D');
      expect(result.orphans[0].referenced_phase).toBe(5);
      expect(result.orphans[0].reason).toContain('Phase 5');
      expect(result.orphans[0].reason).toContain('does not exist');
    });

    it('detects orphan by letter suffix when phase count exceeded', () => {
      const twoPhases = [
        { number: 1, title: 'Phase One' },
        { number: 2, title: 'Phase Two' }
      ];
      const children = [
        { sd_key: 'SD-TEST-001-C', title: 'Some work', status: 'draft', parent_sd_id: 'uuid-1' }
      ];
      const result = detectOrphanChildren(twoPhases, children);
      expect(result.orphans).toHaveLength(1);
      expect(result.orphans[0].sd_key).toBe('SD-TEST-001-C');
      expect(result.orphans[0].reason).toContain('-C');
    });

    it('handles null phases gracefully', () => {
      const children = [
        { sd_key: 'SD-TEST-001-A', title: 'Phase 1: Work', status: 'draft', parent_sd_id: 'uuid-1' }
      ];
      const result = detectOrphanChildren(null, children);
      // With no phases, Phase 1 reference is technically orphan
      expect(result.checkedCount).toBe(1);
    });

    it('handles null children gracefully', () => {
      const result = detectOrphanChildren(phases, null);
      expect(result.orphans).toEqual([]);
      expect(result.checkedCount).toBe(0);
    });
  });

  describe('validatePhaseCoverage (existing + backward compat)', () => {
    it('reports 100% coverage when all phases have SDs', () => {
      const phases = [
        { number: 1, title: 'Phase One', covered_by_sd_key: 'SD-A' },
        { number: 2, title: 'Phase Two', covered_by_sd_key: 'SD-B' }
      ];
      const sds = [
        { sd_key: 'SD-A', title: 'A', status: 'draft' },
        { sd_key: 'SD-B', title: 'B', status: 'draft' }
      ];
      const result = validatePhaseCoverage(phases, sds);
      expect(result.passed).toBe(true);
      expect(result.coveragePercent).toBe(100);
    });

    it('reports uncovered phases', () => {
      const phases = [
        { number: 1, title: 'Phase One', covered_by_sd_key: 'SD-A' },
        { number: 2, title: 'Phase Two' }
      ];
      const sds = [{ sd_key: 'SD-A', title: 'A', status: 'draft' }];
      const result = validatePhaseCoverage(phases, sds);
      expect(result.passed).toBe(false);
      expect(result.uncovered).toHaveLength(1);
      expect(result.uncovered[0].phase.title).toBe('Phase Two');
    });

    it('handles empty phases', () => {
      const result = validatePhaseCoverage([], []);
      expect(result.passed).toBe(true);
      expect(result.totalPhases).toBe(0);
    });
  });

  describe('formatCoverageReport', () => {
    it('formats report with covered and uncovered phases', () => {
      const report = {
        covered: [{ phase: { number: 1, title: 'DB Migration' }, sd_key: 'SD-A', sd_title: 'SD A' }],
        uncovered: [{ phase: { number: 2, title: 'API Work', child_designation: 'B' } }],
        coveragePercent: 50,
        totalPhases: 2,
        coveredCount: 1,
        passed: false
      };
      const output = formatCoverageReport(report);
      expect(output).toContain('DB Migration');
      expect(output).toContain('SD-A');
      expect(output).toContain('API Work');
      expect(output).toContain('BLOCKING');
    });

    it('formats empty phases report', () => {
      const report = { covered: [], uncovered: [], coveragePercent: 100, totalPhases: 0, coveredCount: 0, passed: true };
      const output = formatCoverageReport(report);
      expect(output).toContain('not applicable');
    });
  });
});
