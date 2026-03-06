import { describe, it, expect } from 'vitest';
import {
  getSectionEnforcement,
  getAllSectionEnforcements,
  isKnownSDType
} from '../../../scripts/modules/implementation-fidelity/sd-type-section-policy.js';

describe('sd-type-section-policy', () => {
  describe('getSectionEnforcement', () => {
    it('returns REQUIRED for feature SDs across all sections', () => {
      expect(getSectionEnforcement('feature', 'A')).toBe('REQUIRED');
      expect(getSectionEnforcement('feature', 'B')).toBe('REQUIRED');
      expect(getSectionEnforcement('feature', 'C')).toBe('REQUIRED');
      expect(getSectionEnforcement('feature', 'D')).toBe('REQUIRED');
    });

    it('returns SKIP for all sections of documentation SDs', () => {
      expect(getSectionEnforcement('documentation', 'A')).toBe('SKIP');
      expect(getSectionEnforcement('documentation', 'B')).toBe('SKIP');
      expect(getSectionEnforcement('documentation', 'C')).toBe('SKIP');
      expect(getSectionEnforcement('documentation', 'D')).toBe('SKIP');
    });

    it('returns correct policy for database SDs', () => {
      expect(getSectionEnforcement('database', 'A')).toBe('SKIP');
      expect(getSectionEnforcement('database', 'B')).toBe('REQUIRED');
      expect(getSectionEnforcement('database', 'C')).toBe('ADVISORY');
      expect(getSectionEnforcement('database', 'D')).toBe('REQUIRED');
    });

    it('returns correct policy for infrastructure SDs', () => {
      expect(getSectionEnforcement('infrastructure', 'A')).toBe('SKIP');
      expect(getSectionEnforcement('infrastructure', 'B')).toBe('REQUIRED');
      expect(getSectionEnforcement('infrastructure', 'C')).toBe('SKIP');
      expect(getSectionEnforcement('infrastructure', 'D')).toBe('ADVISORY');
    });

    it('returns ADVISORY for A/B/C and REQUIRED for D on fix/bugfix/refactor/enhancement', () => {
      for (const type of ['fix', 'bugfix', 'refactor', 'enhancement']) {
        expect(getSectionEnforcement(type, 'A')).toBe('ADVISORY');
        expect(getSectionEnforcement(type, 'B')).toBe('ADVISORY');
        expect(getSectionEnforcement(type, 'C')).toBe('ADVISORY');
        expect(getSectionEnforcement(type, 'D')).toBe('REQUIRED');
      }
    });

    it('returns correct policy for performance SDs', () => {
      expect(getSectionEnforcement('performance', 'A')).toBe('SKIP');
      expect(getSectionEnforcement('performance', 'B')).toBe('ADVISORY');
      expect(getSectionEnforcement('performance', 'C')).toBe('ADVISORY');
      expect(getSectionEnforcement('performance', 'D')).toBe('REQUIRED');
    });

    it('returns REQUIRED for unknown SD types', () => {
      expect(getSectionEnforcement('unknown_type', 'A')).toBe('REQUIRED');
      expect(getSectionEnforcement('unknown_type', 'D')).toBe('REQUIRED');
    });

    it('returns REQUIRED for empty/null/undefined SD types', () => {
      expect(getSectionEnforcement('', 'A')).toBe('REQUIRED');
      expect(getSectionEnforcement(null, 'B')).toBe('REQUIRED');
      expect(getSectionEnforcement(undefined, 'C')).toBe('REQUIRED');
    });

    it('normalizes SD type to lowercase', () => {
      expect(getSectionEnforcement('DATABASE', 'A')).toBe('SKIP');
      expect(getSectionEnforcement('Fix', 'A')).toBe('ADVISORY');
      expect(getSectionEnforcement('DOCUMENTATION', 'D')).toBe('SKIP');
    });

    it('trims whitespace from SD type', () => {
      expect(getSectionEnforcement('  database  ', 'A')).toBe('SKIP');
    });

    it('returns REQUIRED for unknown sections', () => {
      expect(getSectionEnforcement('feature', 'Z')).toBe('REQUIRED');
    });
  });

  describe('getAllSectionEnforcements', () => {
    it('returns all four sections for a known type', () => {
      const result = getAllSectionEnforcements('infrastructure');
      expect(result).toEqual({
        A: 'SKIP',
        B: 'REQUIRED',
        C: 'SKIP',
        D: 'ADVISORY'
      });
    });

    it('returns all REQUIRED for unknown type', () => {
      const result = getAllSectionEnforcements('mystery');
      expect(result).toEqual({
        A: 'REQUIRED',
        B: 'REQUIRED',
        C: 'REQUIRED',
        D: 'REQUIRED'
      });
    });
  });

  describe('isKnownSDType', () => {
    it('returns true for all defined types', () => {
      const known = [
        'feature', 'frontend', 'database', 'infrastructure',
        'documentation', 'fix', 'bugfix', 'refactor',
        'enhancement', 'performance'
      ];
      for (const type of known) {
        expect(isKnownSDType(type)).toBe(true);
      }
    });

    it('returns false for unknown types', () => {
      expect(isKnownSDType('unknown')).toBe(false);
      expect(isKnownSDType('')).toBe(false);
      expect(isKnownSDType(null)).toBe(false);
    });

    it('normalizes to lowercase', () => {
      expect(isKnownSDType('FEATURE')).toBe(true);
      expect(isKnownSDType('Database')).toBe(true);
    });
  });
});
