import { describe, it, expect } from 'vitest';
import {
  checkChildrenCompleted,
  checkDeliverablesCrossRef,
  checkOrphanedCapabilities,
  formatGateResult,
} from '../../scripts/gates/integration-verification-gate.js';

describe('integration-verification-gate', () => {
  describe('checkChildrenCompleted', () => {
    it('returns warning for null/empty children', () => {
      expect(checkChildrenCompleted(null).warnings).toHaveLength(1);
      expect(checkChildrenCompleted([]).warnings).toHaveLength(1);
    });

    it('returns no warnings when all children completed', () => {
      const children = [
        { sd_key: 'SD-A', status: 'completed', progress: 100 },
        { sd_key: 'SD-B', status: 'completed', progress: 100 },
      ];
      expect(checkChildrenCompleted(children).warnings).toHaveLength(0);
    });

    it('returns warning for incomplete status', () => {
      const children = [
        { sd_key: 'SD-A', status: 'in_progress', progress: 100 },
      ];
      const result = checkChildrenCompleted(children);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('SD-A');
      expect(result.warnings[0]).toContain('in_progress');
    });

    it('returns warning for incomplete progress', () => {
      const children = [
        { sd_key: 'SD-A', status: 'completed', progress: 60 },
      ];
      const result = checkChildrenCompleted(children);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('60%');
    });

    it('handles null progress gracefully', () => {
      const children = [
        { sd_key: 'SD-A', status: 'completed', progress: null },
      ];
      expect(checkChildrenCompleted(children).warnings).toHaveLength(0);
    });
  });

  describe('checkDeliverablesCrossRef', () => {
    it('returns no warnings for empty handoffs', () => {
      expect(checkDeliverablesCrossRef(null, []).warnings).toHaveLength(0);
      expect(checkDeliverablesCrossRef([], []).warnings).toHaveLength(0);
    });

    it('warns about children with no deliverables', () => {
      const children = [{ sd_key: 'SD-A' }, { sd_key: 'SD-B' }];
      const handoffs = [
        { sd_id: 'SD-A', deliverables_manifest: { deliverables: ['file.js'] } },
      ];
      const result = checkDeliverablesCrossRef(handoffs, children);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('SD-B');
    });

    it('no warnings when all children have deliverables', () => {
      const children = [{ sd_key: 'SD-A' }];
      const handoffs = [
        { sd_id: 'SD-A', deliverables_manifest: ['file.js'] },
      ];
      const result = checkDeliverablesCrossRef(handoffs, children);
      expect(result.warnings).toHaveLength(0);
    });

    it('handles string deliverables', () => {
      const children = [{ sd_key: 'SD-A' }];
      const handoffs = [
        { sd_id: 'SD-A', deliverables_manifest: ['script.js'] },
      ];
      expect(checkDeliverablesCrossRef(handoffs, children).warnings).toHaveLength(0);
    });

    it('handles null manifest gracefully', () => {
      const children = [{ sd_key: 'SD-A' }];
      const handoffs = [{ sd_id: 'SD-A', deliverables_manifest: null }];
      const result = checkDeliverablesCrossRef(handoffs, children);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe('checkOrphanedCapabilities', () => {
    it('returns no warnings for empty children', () => {
      expect(checkOrphanedCapabilities(null, []).warnings).toHaveLength(0);
      expect(checkOrphanedCapabilities([], []).warnings).toHaveLength(0);
    });

    it('returns no warnings when no capabilities delivered', () => {
      const children = [{ sd_key: 'SD-A', delivers_capabilities: [] }];
      expect(checkOrphanedCapabilities(children, []).warnings).toHaveLength(0);
    });

    it('warns about orphaned capabilities', () => {
      const children = [
        { sd_key: 'SD-A', delivers_capabilities: [{ capability_key: 'cap-1' }] },
      ];
      const allSds = [
        { sd_key: 'SD-X', dependencies: [] },
      ];
      const result = checkOrphanedCapabilities(children, allSds);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('cap-1');
    });

    it('no warning when capability is consumed', () => {
      const children = [
        { sd_key: 'SD-A', delivers_capabilities: [{ capability_key: 'cap-1' }] },
      ];
      const allSds = [
        { sd_key: 'SD-X', dependencies: [{ capability: 'cap-1' }] },
      ];
      const result = checkOrphanedCapabilities(children, allSds);
      expect(result.warnings).toHaveLength(0);
    });

    it('handles string capabilities', () => {
      const children = [
        { sd_key: 'SD-A', delivers_capabilities: ['cap-str'] },
      ];
      const result = checkOrphanedCapabilities(children, []);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('cap-str');
    });
  });

  describe('formatGateResult', () => {
    it('returns empty for null', () => {
      expect(formatGateResult(null)).toBe('');
    });

    it('formats clean result', () => {
      const result = {
        score: 100,
        warnings: [],
        checks: {
          children_completed: true,
          deliverables_cross_ref: true,
          no_orphaned_capabilities: true,
        },
      };
      const output = formatGateResult(result);
      expect(output).toContain('100/100');
      expect(output).toContain('All integration checks passed');
    });

    it('formats result with warnings', () => {
      const result = {
        score: 70,
        warnings: ['SD-A: incomplete'],
        checks: {
          children_completed: false,
          deliverables_cross_ref: true,
          no_orphaned_capabilities: true,
        },
      };
      const output = formatGateResult(result);
      expect(output).toContain('70/100');
      expect(output).toContain('SD-A: incomplete');
    });
  });
});
