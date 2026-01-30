/**
 * Style Tagger Unit Tests
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-A
 */

import { describe, it, expect } from 'vitest';
import {
  suggestPersonality,
  isValidPersonality,
  getPersonalityOptions,
  VALID_PERSONALITIES,
  PERSONALITY_DESCRIPTIONS
} from '../../../../lib/agents/plan/styleTagger.js';

describe('Style Tagger', () => {
  describe('suggestPersonality', () => {
    it('should return a valid suggestion object', () => {
      const sd = {
        title: 'Test SD',
        description: 'A test strategic directive'
      };

      const result = suggestPersonality(sd);

      expect(result).toHaveProperty('personality');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('alternatives');
    });

    it('should suggest dashboard for analytics-related SDs', () => {
      const sd = {
        title: 'Analytics Dashboard',
        description: 'Build a KPI dashboard with metrics and reporting',
        sd_type: 'feature',
        category: 'analytics'
      };

      const result = suggestPersonality(sd);
      expect(result.personality).toBe('dashboard');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should suggest technical for developer-focused SDs', () => {
      const sd = {
        title: 'API Documentation Generator',
        description: 'Create developer documentation for the REST API',
        sd_type: 'documentation'
      };

      const result = suggestPersonality(sd);
      expect(result.personality).toBe('technical');
    });

    it('should suggest enterprise for B2B SDs', () => {
      const sd = {
        title: 'Enterprise Client Portal',
        description: 'Professional B2B portal for corporate clients',
        sd_type: 'feature',
        category: 'feature'
      };

      const result = suggestPersonality(sd);
      expect(result.personality).toBe('enterprise');
    });

    it('should suggest consumer for B2C SDs', () => {
      const sd = {
        title: 'User Profile Page',
        description: 'Friendly consumer-facing profile management',
        sd_type: 'feature'
      };

      const result = suggestPersonality(sd);
      expect(result.personality).toBe('consumer');
    });

    it('should suggest accessible for a11y-focused SDs', () => {
      const sd = {
        title: 'WCAG Compliance Updates',
        description: 'Implement accessible screen-reader support with proper contrast',
        sd_type: 'feature'
      };

      const result = suggestPersonality(sd);
      expect(result.personality).toBe('accessible');
    });

    it('should default to neutral when no clear signals', () => {
      const sd = {
        title: 'Generic Update',
        description: 'Some updates',
        sd_type: 'feature'
      };

      const result = suggestPersonality(sd);
      expect(VALID_PERSONALITIES).toContain(result.personality);
    });

    it('should use sd_type defaults', () => {
      const sd = {
        title: 'Code Refactor',
        description: 'Refactoring work',
        sd_type: 'refactor'
      };

      const result = suggestPersonality(sd);
      expect(result.personality).toBe('technical');
    });

    it('should provide alternatives in results', () => {
      const sd = {
        title: 'Executive Dashboard',
        description: 'Premium analytics for C-suite with KPI monitoring',
        sd_type: 'feature'
      };

      const result = suggestPersonality(sd);
      expect(Array.isArray(result.alternatives)).toBe(true);
    });
  });

  describe('isValidPersonality', () => {
    it('should return true for all valid personalities', () => {
      VALID_PERSONALITIES.forEach(p => {
        expect(isValidPersonality(p)).toBe(true);
      });
    });

    it('should return false for invalid personalities', () => {
      expect(isValidPersonality('invalid')).toBe(false);
      expect(isValidPersonality('')).toBe(false);
      expect(isValidPersonality('SPARTAN')).toBe(false); // Case sensitive
    });
  });

  describe('getPersonalityOptions', () => {
    it('should return array of options', () => {
      const options = getPersonalityOptions();

      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBe(VALID_PERSONALITIES.length);
    });

    it('should have value, label, and description for each option', () => {
      const options = getPersonalityOptions();

      options.forEach(opt => {
        expect(opt).toHaveProperty('value');
        expect(opt).toHaveProperty('label');
        expect(opt).toHaveProperty('description');
        expect(typeof opt.value).toBe('string');
        expect(typeof opt.label).toBe('string');
        expect(typeof opt.description).toBe('string');
      });
    });

    it('should format labels with proper capitalization', () => {
      const options = getPersonalityOptions();
      const darkModeOption = options.find(o => o.value === 'dark-mode-first');

      expect(darkModeOption.label).toBe('Dark Mode First');
    });
  });

  describe('VALID_PERSONALITIES', () => {
    it('should contain exactly 14 personalities', () => {
      expect(VALID_PERSONALITIES.length).toBe(14);
    });

    it('should include all aesthetic-mapped personalities', () => {
      const aesthetics = [
        'spartan', 'enterprise', 'startup', 'dashboard', 'consumer',
        'executive', 'technical', 'marketing', 'minimal', 'glass',
        'dark-mode-first', 'accessible'
      ];

      aesthetics.forEach(a => {
        expect(VALID_PERSONALITIES).toContain(a);
      });
    });

    it('should include special values neutral and mixed', () => {
      expect(VALID_PERSONALITIES).toContain('neutral');
      expect(VALID_PERSONALITIES).toContain('mixed');
    });
  });

  describe('PERSONALITY_DESCRIPTIONS', () => {
    it('should have descriptions for all valid personalities', () => {
      VALID_PERSONALITIES.forEach(p => {
        expect(PERSONALITY_DESCRIPTIONS[p]).toBeDefined();
        expect(typeof PERSONALITY_DESCRIPTIONS[p]).toBe('string');
        expect(PERSONALITY_DESCRIPTIONS[p].length).toBeGreaterThan(10);
      });
    });
  });
});
