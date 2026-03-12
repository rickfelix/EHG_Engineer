import { describe, it, expect, beforeEach } from 'vitest';
import { DiversityValidator } from '../../../../lib/eva/pipeline-runner/diversity-validator.js';

describe('DiversityValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new DiversityValidator();
  });

  describe('validate', () => {
    it('should pass with evenly distributed archetypes', () => {
      const ventures = [
        { archetype: 'democratizer' },
        { archetype: 'automator' },
        { archetype: 'optimizer' },
        { archetype: 'connector' },
      ];
      const result = validator.validate(ventures);
      expect(result.valid).toBe(true);
      expect(result.normalizedEntropy).toBe(1.0);
      expect(result.correlationAlerts).toHaveLength(0);
    });

    it('should fail with all same archetype', () => {
      const ventures = [
        { archetype: 'democratizer' },
        { archetype: 'democratizer' },
        { archetype: 'democratizer' },
        { archetype: 'democratizer' },
      ];
      const result = validator.validate(ventures);
      expect(result.valid).toBe(false);
      expect(result.normalizedEntropy).toBe(0);
    });

    it('should detect correlation alerts when archetype deviates from uniform', () => {
      // 4/5 = 80% of one type, uniform = 50%, deviation = 30% = 0.3 threshold
      // Need deviation > 0.3 strictly, so use 5/6
      const ventures = [
        { archetype: 'democratizer' },
        { archetype: 'democratizer' },
        { archetype: 'democratizer' },
        { archetype: 'democratizer' },
        { archetype: 'democratizer' },
        { archetype: 'automator' },
      ];
      const result = validator.validate(ventures);
      expect(result.correlationAlerts.length).toBeGreaterThan(0);
      const hasAlert = result.correlationAlerts.some(a => a.includes('democratizer'));
      expect(hasAlert).toBe(true);
    });

    it('should warn for batches smaller than minBatchSizeForValidation', () => {
      const ventures = [
        { archetype: 'democratizer' },
        { archetype: 'automator' },
      ];
      const result = validator.validate(ventures);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('below minimum');
    });

    it('should return invalid for empty ventures array', () => {
      const result = validator.validate([]);
      expect(result.valid).toBe(false);
      expect(result.correlationAlerts).toContain('Empty batch');
    });

    it('should respect custom config thresholds', () => {
      const strict = new DiversityValidator({
        minNormalizedEntropy: 0.9,
        correlationThreshold: 0.1,
      });
      const ventures = [
        { archetype: 'democratizer' },
        { archetype: 'democratizer' },
        { archetype: 'automator' },
        { archetype: 'optimizer' },
      ];
      const result = strict.validate(ventures);
      expect(result.valid).toBe(false);
    });

    it('should include distribution in result', () => {
      const ventures = [
        { archetype: 'democratizer' },
        { archetype: 'automator' },
        { archetype: 'optimizer' },
        { archetype: 'connector' },
      ];
      const result = validator.validate(ventures);
      expect(result.distribution).toBeDefined();
      expect(result.distribution.democratizer.count).toBe(1);
      expect(result.distribution.democratizer.proportion).toBe(0.25);
    });
  });
});
