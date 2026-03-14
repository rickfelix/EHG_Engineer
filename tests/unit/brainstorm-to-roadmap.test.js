import { describe, it, expect } from 'vitest';
import { qualifiesForRoadmap } from '../../scripts/modules/brainstorm-to-roadmap.js';

describe('brainstorm-to-roadmap', () => {
  describe('qualifiesForRoadmap', () => {
    it('returns false for null/undefined', () => {
      expect(qualifiesForRoadmap(null)).toBe(false);
      expect(qualifiesForRoadmap(undefined)).toBe(false);
    });

    it('returns false when missing vision_key', () => {
      expect(qualifiesForRoadmap({ metadata: { arch_key: 'ARCH-001' } })).toBe(false);
    });

    it('returns false when missing arch_key', () => {
      expect(qualifiesForRoadmap({ metadata: { vision_key: 'VIS-001' } })).toBe(false);
    });

    it('returns false when metadata is empty', () => {
      expect(qualifiesForRoadmap({ metadata: {} })).toBe(false);
    });

    it('returns false when no metadata', () => {
      expect(qualifiesForRoadmap({})).toBe(false);
    });

    it('returns true when both vision_key and arch_key present', () => {
      expect(qualifiesForRoadmap({
        metadata: { vision_key: 'VIS-001', arch_key: 'ARCH-001' }
      })).toBe(true);
    });

    it('returns true with extra metadata fields', () => {
      expect(qualifiesForRoadmap({
        metadata: { vision_key: 'VIS-001', arch_key: 'ARCH-001', other: 'data' }
      })).toBe(true);
    });
  });
});
