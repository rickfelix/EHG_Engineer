import { describe, it, expect } from 'vitest';
import {
  scoreChildCount,
  scoreCrossChildDeps,
  scoreHandoffCount,
  scoreCapabilityOverlap,
  getTrackThreshold,
  formatAdvisory,
} from '../../lib/analysis/scope-complexity-scorer.js';

describe('scope-complexity-scorer', () => {
  describe('scoreChildCount', () => {
    it('returns 0 for null/undefined', () => {
      expect(scoreChildCount(null)).toBe(0);
      expect(scoreChildCount(undefined)).toBe(0);
    });

    it('returns 0 for negative values', () => {
      expect(scoreChildCount(-1)).toBe(0);
    });

    it('returns 0 for 0 children', () => {
      expect(scoreChildCount(0)).toBe(0);
    });

    it('returns 5 for 1-2 children', () => {
      expect(scoreChildCount(1)).toBe(5);
      expect(scoreChildCount(2)).toBe(5);
    });

    it('returns 10 for 3-4 children', () => {
      expect(scoreChildCount(3)).toBe(10);
      expect(scoreChildCount(4)).toBe(10);
    });

    it('returns 15 for 5-7 children', () => {
      expect(scoreChildCount(5)).toBe(15);
      expect(scoreChildCount(7)).toBe(15);
    });

    it('returns 20 for 8-10 children', () => {
      expect(scoreChildCount(8)).toBe(20);
      expect(scoreChildCount(10)).toBe(20);
    });

    it('returns 25 for 10+ children', () => {
      expect(scoreChildCount(11)).toBe(25);
      expect(scoreChildCount(50)).toBe(25);
    });
  });

  describe('scoreCrossChildDeps', () => {
    it('returns 0 for null/empty arrays', () => {
      expect(scoreCrossChildDeps(null)).toBe(0);
      expect(scoreCrossChildDeps([])).toBe(0);
    });

    it('returns 0 for single child', () => {
      expect(scoreCrossChildDeps([{ dependencies: ['a', 'b'] }])).toBe(0);
    });

    it('returns 0 when no shared dependencies', () => {
      const children = [
        { dependencies: [{ dependency: 'dep-a' }] },
        { dependencies: [{ dependency: 'dep-b' }] },
      ];
      expect(scoreCrossChildDeps(children)).toBe(0);
    });

    it('returns 5 for 1 shared dependency', () => {
      const children = [
        { dependencies: [{ dependency: 'shared' }] },
        { dependencies: [{ dependency: 'shared' }, { dependency: 'unique' }] },
      ];
      expect(scoreCrossChildDeps(children)).toBe(5);
    });

    it('returns 10 for 2-3 shared dependencies', () => {
      const children = [
        { dependencies: [{ dependency: 'a' }, { dependency: 'b' }] },
        { dependencies: [{ dependency: 'a' }, { dependency: 'b' }] },
      ];
      expect(scoreCrossChildDeps(children)).toBe(10);
    });

    it('handles string dependencies', () => {
      const children = [
        { dependencies: ['shared-dep'] },
        { dependencies: ['shared-dep', 'other'] },
      ];
      expect(scoreCrossChildDeps(children)).toBe(5);
    });

    it('handles null dependencies gracefully', () => {
      const children = [
        { dependencies: null },
        { dependencies: [{ dependency: 'a' }] },
      ];
      expect(scoreCrossChildDeps(children)).toBe(0);
    });
  });

  describe('scoreHandoffCount', () => {
    it('returns 0 for null/undefined', () => {
      expect(scoreHandoffCount(null)).toBe(0);
      expect(scoreHandoffCount(undefined)).toBe(0);
    });

    it('returns 0 for 0-2 handoffs', () => {
      expect(scoreHandoffCount(0)).toBe(0);
      expect(scoreHandoffCount(2)).toBe(0);
    });

    it('returns 5 for 3-5 handoffs', () => {
      expect(scoreHandoffCount(3)).toBe(5);
      expect(scoreHandoffCount(5)).toBe(5);
    });

    it('returns 10 for 6-10 handoffs', () => {
      expect(scoreHandoffCount(6)).toBe(10);
      expect(scoreHandoffCount(10)).toBe(10);
    });

    it('returns 15 for 11-15 handoffs', () => {
      expect(scoreHandoffCount(11)).toBe(15);
      expect(scoreHandoffCount(15)).toBe(15);
    });

    it('returns 20 for 16-25 handoffs', () => {
      expect(scoreHandoffCount(16)).toBe(20);
      expect(scoreHandoffCount(25)).toBe(20);
    });

    it('returns 25 for 26+ handoffs', () => {
      expect(scoreHandoffCount(26)).toBe(25);
      expect(scoreHandoffCount(100)).toBe(25);
    });
  });

  describe('scoreCapabilityOverlap', () => {
    it('returns 0 for null/empty', () => {
      expect(scoreCapabilityOverlap(null)).toBe(0);
      expect(scoreCapabilityOverlap([])).toBe(0);
    });

    it('returns 0 for single child', () => {
      expect(scoreCapabilityOverlap([
        { delivers_capabilities: [{ capability_key: 'a' }] },
      ])).toBe(0);
    });

    it('returns 0 when no overlap', () => {
      const children = [
        { delivers_capabilities: [{ capability_key: 'cap-a' }] },
        { delivers_capabilities: [{ capability_key: 'cap-b' }] },
      ];
      expect(scoreCapabilityOverlap(children)).toBe(0);
    });

    it('returns 5 for 1 overlapping capability', () => {
      const children = [
        { delivers_capabilities: [{ capability_key: 'shared' }] },
        { delivers_capabilities: [{ capability_key: 'shared' }] },
      ];
      expect(scoreCapabilityOverlap(children)).toBe(5);
    });

    it('handles null delivers_capabilities', () => {
      const children = [
        { delivers_capabilities: null },
        { delivers_capabilities: [{ capability_key: 'a' }] },
      ];
      expect(scoreCapabilityOverlap(children)).toBe(0);
    });
  });

  describe('getTrackThreshold', () => {
    it('returns correct threshold for A track', () => {
      expect(getTrackThreshold('A')).toEqual({ track: 'A', value: 5 });
    });

    it('returns correct threshold for B track', () => {
      expect(getTrackThreshold('B')).toEqual({ track: 'B', value: 4 });
    });

    it('returns correct threshold for C track', () => {
      expect(getTrackThreshold('C')).toEqual({ track: 'C', value: 3 });
    });

    it('defaults to B for unknown track', () => {
      expect(getTrackThreshold('X')).toEqual({ track: 'X', value: 4 });
    });

    it('handles null/empty', () => {
      expect(getTrackThreshold(null)).toEqual({ track: '', value: 4 });
      expect(getTrackThreshold('')).toEqual({ track: '', value: 4 });
    });
  });

  describe('formatAdvisory', () => {
    it('returns empty string for null', () => {
      expect(formatAdvisory(null)).toBe('');
    });

    it('formats advisory with threshold not exceeded', () => {
      const result = {
        score: 15,
        dimensions: { child_count: 5, cross_child_deps: 5, handoff_count: 5, capability_overlap: 0 },
        threshold: { track: 'B', value: 4, exceeded: false },
      };
      const output = formatAdvisory(result);
      expect(output).toContain('15/100');
      expect(output).toContain('Within track threshold');
    });

    it('formats advisory with threshold exceeded', () => {
      const result = {
        score: 85,
        dimensions: { child_count: 25, cross_child_deps: 20, handoff_count: 20, capability_overlap: 20 },
        threshold: { track: 'C', value: 3, exceeded: true },
      };
      const output = formatAdvisory(result);
      expect(output).toContain('85/100');
      expect(output).toContain('exceeds track threshold');
    });
  });
});
