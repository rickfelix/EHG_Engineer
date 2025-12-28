/**
 * Unit tests for IntensityDetector module
 *
 * Part of: SD-REFACTOR-TEST-001
 * Tests the extracted intensity detection logic for refactoring SDs
 */

import { describe, test, expect } from 'vitest';
import {
  detectIntensity,
  detectIntensityForSD,
  isValidIntensityLevel,
  getIntensityConfig,
  VALID_INTENSITY_LEVELS,
  INTENSITY_HINTS
} from '../scripts/modules/intensity-detector.js';

describe('IntensityDetector', () => {
  describe('VALID_INTENSITY_LEVELS', () => {
    test('should contain all three intensity levels', () => {
      expect(VALID_INTENSITY_LEVELS).toEqual(['cosmetic', 'structural', 'architectural']);
    });
  });

  describe('INTENSITY_HINTS', () => {
    test('should have configuration for all intensity levels', () => {
      expect(INTENSITY_HINTS).toHaveProperty('cosmetic');
      expect(INTENSITY_HINTS).toHaveProperty('structural');
      expect(INTENSITY_HINTS).toHaveProperty('architectural');
    });

    test('cosmetic should have appropriate keywords', () => {
      expect(INTENSITY_HINTS.cosmetic.keywords).toContain('rename');
      expect(INTENSITY_HINTS.cosmetic.keywords).toContain('format');
      expect(INTENSITY_HINTS.cosmetic.keywords).toContain('comment');
    });

    test('structural should have appropriate keywords', () => {
      expect(INTENSITY_HINTS.structural.keywords).toContain('extract');
      expect(INTENSITY_HINTS.structural.keywords).toContain('consolidate');
      expect(INTENSITY_HINTS.structural.keywords).toContain('reorganize');
    });

    test('architectural should have appropriate keywords', () => {
      expect(INTENSITY_HINTS.architectural.keywords).toContain('pattern');
      expect(INTENSITY_HINTS.architectural.keywords).toContain('redesign');
      expect(INTENSITY_HINTS.architectural.keywords).toContain('architecture');
    });
  });

  describe('detectIntensity', () => {
    test('should return cosmetic for rename-related titles', () => {
      // Multiple cosmetic keywords to beat default 50% confidence
      const result = detectIntensity('Rename function naming to follow style convention', '', []);
      expect(result.suggestedIntensity).toBe('cosmetic');
      expect(result.keywords).toContain('rename');
    });

    test('should return cosmetic for formatting titles', () => {
      // Multiple cosmetic keywords: format, style
      const result = detectIntensity('Format code and fix style issues', '', []);
      expect(result.suggestedIntensity).toBe('cosmetic');
      expect(result.keywords).toContain('format');
    });

    test('should return structural for extract-related titles', () => {
      // Avoid architectural keywords (layer, module, pattern, etc.)
      const result = detectIntensity('Extract helper functions from UserService', '', []);
      expect(result.suggestedIntensity).toBe('structural');
      expect(result.keywords).toContain('extract');
    });

    test('should return structural for consolidate-related titles', () => {
      // Avoid architectural keywords (layer, module, pattern, etc.)
      const result = detectIntensity('Consolidate authentication utils into single file', '', []);
      expect(result.suggestedIntensity).toBe('structural');
      expect(result.keywords).toContain('consolidate');
    });

    test('should return architectural for redesign-related titles', () => {
      const result = detectIntensity('Redesign event-driven architecture for notifications', '', []);
      expect(result.suggestedIntensity).toBe('architectural');
      expect(result.keywords).toContain('redesign');
      expect(result.keywords).toContain('architecture');
    });

    test('should return architectural for pattern-related titles', () => {
      const result = detectIntensity('Apply repository pattern for data access', '', []);
      expect(result.suggestedIntensity).toBe('architectural');
      expect(result.keywords).toContain('pattern');
    });

    test('should default to structural when no keywords match', () => {
      const result = detectIntensity('Update the code to be better', '', []);
      expect(result.suggestedIntensity).toBe('structural');
      expect(result.confidence).toBe(50);
      expect(result.reasoning).toContain('No keywords matched');
    });

    test('should handle empty input gracefully', () => {
      const result = detectIntensity('', '', []);
      expect(result.suggestedIntensity).toBe('structural');
      expect(result.confidence).toBe(50);
    });

    test('should handle null input gracefully', () => {
      const result = detectIntensity(null, null, null);
      expect(result.suggestedIntensity).toBe('structural');
      expect(result.confidence).toBe(50);
    });

    test('should consider description in addition to title', () => {
      const result = detectIntensity(
        'Variable updates',
        'Rename all variables to follow camelCase naming convention',
        []
      );
      // Cosmetic has keywords: rename, naming - both present
      expect(result.suggestedIntensity).toBe('cosmetic');
      expect(result.keywords).toContain('rename');
    });

    test('should consider keyChanges in analysis', () => {
      const result = detectIntensity(
        'Service update',
        '',
        { changes: ['extract helper functions', 'consolidate imports'] }
      );
      expect(result.suggestedIntensity).toBe('structural');
    });
  });

  describe('detectIntensityForSD', () => {
    test('should return not applicable for non-refactor SDs', () => {
      const sd = { sd_type: 'feature', title: 'Build new feature' };
      const result = detectIntensityForSD(sd);
      expect(result.applicable).toBe(false);
      expect(result.reason).toBe('Intensity detection only applies to refactor SDs');
    });

    test('should return applicable with suggestion for refactor SDs', () => {
      const sd = {
        sd_type: 'refactor',
        title: 'Extract helper functions',  // Pure structural - no architectural keywords
        description: ''
      };
      const result = detectIntensityForSD(sd);
      expect(result.applicable).toBe(true);
      expect(result.suggestedIntensity).toBe('structural');
    });

    test('should provide recommendation when intensity_level not set', () => {
      const sd = {
        sd_type: 'refactor',
        title: 'Rename function to follow naming convention',  // Clear cosmetic keywords
        description: ''
      };
      const result = detectIntensityForSD(sd);
      expect(result.recommendation).toContain('Set intensity_level');
      expect(result.recommendation).toContain('REQUIRED');
    });

    test('should compare current vs suggested when intensity_level set', () => {
      const sd = {
        sd_type: 'refactor',
        title: 'Rename function to follow naming convention',  // Clear cosmetic keywords
        description: '',
        intensity_level: 'structural'
      };
      const result = detectIntensityForSD(sd);
      expect(result.recommendation).toContain('Current: structural');
      expect(result.recommendation).toContain('Suggested: cosmetic');
    });
  });

  describe('isValidIntensityLevel', () => {
    test('should return true for valid intensity levels', () => {
      expect(isValidIntensityLevel('cosmetic')).toBe(true);
      expect(isValidIntensityLevel('structural')).toBe(true);
      expect(isValidIntensityLevel('architectural')).toBe(true);
    });

    test('should return false for invalid intensity levels', () => {
      expect(isValidIntensityLevel('major')).toBe(false);
      expect(isValidIntensityLevel('minor')).toBe(false);
      expect(isValidIntensityLevel('')).toBe(false);
      expect(isValidIntensityLevel(null)).toBe(false);
    });
  });

  describe('getIntensityConfig', () => {
    test('should return config for valid intensity levels', () => {
      const config = getIntensityConfig('cosmetic');
      expect(config).not.toBeNull();
      expect(config.keywords).toBeDefined();
      expect(config.weight).toBeDefined();
    });

    test('should return null for invalid intensity levels', () => {
      expect(getIntensityConfig('invalid')).toBeNull();
      expect(getIntensityConfig('')).toBeNull();
    });
  });
});
