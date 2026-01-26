/**
 * Unit tests for normalizeConfidence function
 * SD-LEO-FIX-COLUMN-NAMES-001
 *
 * Tests the confidence field normalization that handles schema/code mismatch
 * where sub-agents emit `confidence_score` but DB uses `confidence`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizeConfidence } from '../../../lib/sub-agent-executor/results-storage.js';

describe('normalizeConfidence', () => {
  const defaultOptions = { sdId: 'SD-TEST-001', subAgentCode: 'TESTING' };

  describe('TS-1: Happy path - only confidence_score provided', () => {
    it('should return confidence_score value when only confidence_score is provided', () => {
      const results = { confidence_score: 87 };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBe(87);
      expect(result.source).toBe('confidence_score');
      expect(result.warning).toBeNull();
    });

    it('should handle confidence_score of 0 (valid value)', () => {
      const results = { confidence_score: 0 };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBe(0);
      expect(result.source).toBe('confidence_score');
      expect(result.warning).toBeNull();
    });

    it('should handle confidence_score of 100 (max value)', () => {
      const results = { confidence_score: 100 };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBe(100);
      expect(result.source).toBe('confidence_score');
      expect(result.warning).toBeNull();
    });
  });

  describe('TS-2: Backward compatibility - only legacy confidence provided', () => {
    it('should map legacy confidence field and emit warning', () => {
      const results = { confidence: 73 };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBe(73);
      expect(result.source).toBe('confidence_legacy');
      expect(result.warning).toContain('confidence.legacy_mapped');
      expect(result.warning).toContain('SD-TEST-001');
      expect(result.warning).toContain('TESTING');
    });
  });

  describe('TS-3: Dual-field input prefers confidence_score', () => {
    it('should use confidence_score when both fields present and emit warning', () => {
      const results = { confidence_score: 90, confidence: 10 };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBe(90);
      expect(result.source).toBe('confidence_score');
      expect(result.warning).toContain('confidence.dual_fields');
      expect(result.warning).toContain('90');
      expect(result.warning).toContain('10');
    });
  });

  describe('TS-4: Missing confidence persists NULL (default-off behavior)', () => {
    beforeEach(() => {
      delete process.env.EHG_CONFIDENCE_DEFAULT_ENABLED;
    });

    it('should return NULL when no confidence provided and defaulting is off', () => {
      const results = {};
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBeNull();
      expect(result.source).toBe('missing');
      expect(result.warning).toContain('confidence.missing');
    });

    it('should return NULL when confidence fields are explicitly undefined', () => {
      const results = { confidence_score: undefined, confidence: undefined };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBeNull();
      expect(result.source).toBe('missing');
    });

    it('should return NULL when confidence fields are explicitly null', () => {
      const results = { confidence_score: null, confidence: null };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBeNull();
      expect(result.source).toBe('missing');
    });
  });

  describe('TS-4b: Missing confidence defaults to 50 when enabled', () => {
    beforeEach(() => {
      process.env.EHG_CONFIDENCE_DEFAULT_ENABLED = 'true';
    });

    afterEach(() => {
      delete process.env.EHG_CONFIDENCE_DEFAULT_ENABLED;
    });

    it('should return 50 when no confidence and EHG_CONFIDENCE_DEFAULT_ENABLED=true', () => {
      const results = {};
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBe(50);
      expect(result.source).toBe('default');
      expect(result.warning).toContain('confidence.missing');
      expect(result.warning).toContain('defaulting to 50');
    });
  });

  describe('TS-5: Invalid confidence value is rejected', () => {
    it('should reject negative confidence_score', () => {
      const results = { confidence_score: -1 };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBeNull();
      expect(result.source).toBe('invalid');
      expect(result.warning).toContain('confidence.invalid');
      expect(result.warning).toContain('outside valid range');
    });

    it('should reject confidence_score over 100', () => {
      const results = { confidence_score: 101 };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBeNull();
      expect(result.source).toBe('invalid');
      expect(result.warning).toContain('confidence.invalid');
      expect(result.warning).toContain('outside valid range');
    });

    it('should reject NaN confidence_score', () => {
      const results = { confidence_score: NaN };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBeNull();
      expect(result.source).toBe('invalid');
      expect(result.warning).toContain('confidence.invalid');
      expect(result.warning).toContain('not a finite number');
    });

    it('should reject Infinity confidence_score', () => {
      const results = { confidence_score: Infinity };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBeNull();
      expect(result.source).toBe('invalid');
      expect(result.warning).toContain('confidence.invalid');
    });

    it('should reject string confidence_score', () => {
      const results = { confidence_score: '90' };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBeNull();
      expect(result.source).toBe('invalid');
      expect(result.warning).toContain('confidence.invalid');
      expect(result.warning).toContain('Expected number');
    });

    it('should reject object confidence_score', () => {
      const results = { confidence_score: { value: 90 } };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBeNull();
      expect(result.source).toBe('invalid');
    });
  });

  describe('Edge cases', () => {
    it('should include SD ID and sub-agent code in all warnings', () => {
      const options = { sdId: 'SD-CUSTOM-123', subAgentCode: 'DATABASE' };
      const results = { confidence: 50 };
      const result = normalizeConfidence(results, options);

      expect(result.warning).toContain('SD-CUSTOM-123');
      expect(result.warning).toContain('DATABASE');
    });

    it('should handle missing options gracefully', () => {
      const results = { confidence_score: 80 };
      const result = normalizeConfidence(results);

      expect(result.value).toBe(80);
      expect(result.source).toBe('confidence_score');
    });

    it('should handle empty options gracefully', () => {
      const results = { confidence_score: 80 };
      const result = normalizeConfidence(results, {});

      expect(result.value).toBe(80);
    });

    it('should handle decimal confidence values', () => {
      const results = { confidence_score: 87.5 };
      const result = normalizeConfidence(results, defaultOptions);

      expect(result.value).toBe(87.5);
      expect(result.source).toBe('confidence_score');
    });
  });
});
