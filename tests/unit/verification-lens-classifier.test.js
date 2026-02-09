/**
 * Unit tests for Verification Lens Classifier
 * SD-LEO-FEAT-CLARIFY-VERIFICATION-TAXONOMY-001 (FR-4)
 */
import { describe, it, expect } from 'vitest';
import {
  classifyVerificationLens,
  VERIFICATION_LENS
} from '../../lib/quality/context-analyzer.js';

describe('classifyVerificationLens', () => {
  describe('TRIANGULATION classification', () => {
    it('classifies implementation claims as TRIANGULATION', () => {
      const item = { title: 'The login endpoint already handles token refresh', description: '' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.TRIANGULATION);
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('classifies code references as TRIANGULATION', () => {
      const item = { title: 'Bug in the user migration table', description: 'The column is missing' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.TRIANGULATION);
    });

    it('classifies file/function mentions as TRIANGULATION', () => {
      const item = { title: 'Check if the function exists', description: 'import from module not working' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.TRIANGULATION);
    });

    it('classifies "already implemented" as TRIANGULATION', () => {
      const item = { title: 'Feature already exists', description: 'This was already implemented last week' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.TRIANGULATION);
    });
  });

  describe('DEBATE classification', () => {
    it('classifies proposals as DEBATE', () => {
      const item = { title: 'Proposal to add rate limiting to all public API endpoints', description: '' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.DEBATE);
    });

    it('classifies "should we" questions as DEBATE', () => {
      const item = { title: 'Should we migrate to a new auth provider?', description: '' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.DEBATE);
    });

    it('classifies evaluation requests as DEBATE', () => {
      const item = { title: 'Evaluate this approach', description: 'Assess the pros and cons of this trade-off' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.DEBATE);
    });
  });

  describe('RESEARCH classification', () => {
    it('classifies comparison questions as RESEARCH', () => {
      const item = { title: 'Redis vs Memcached for session cache', description: 'Compare the options' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.RESEARCH);
    });

    it('classifies "best approach" questions as RESEARCH', () => {
      const item = { title: 'What is the best approach for real-time notifications?', description: '' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.RESEARCH);
    });

    it('classifies exploration questions as RESEARCH', () => {
      const item = { title: 'Explore alternatives for state management', description: 'What are the options?' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.RESEARCH);
    });
  });

  describe('default behavior', () => {
    it('defaults to DEBATE for ambiguous items', () => {
      const item = { title: 'Something about the system', description: 'No clear signal here' };
      const result = classifyVerificationLens(item);
      expect(result.lens).toBe(VERIFICATION_LENS.DEBATE);
      expect(result.confidence).toBeLessThan(0.6);
    });

    it('handles empty items gracefully', () => {
      const result = classifyVerificationLens({ title: '', description: '' });
      expect(result.lens).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.reason).toBeDefined();
    });
  });

  describe('lens override', () => {
    it('respects manual override', () => {
      const item = { title: 'The endpoint is broken', description: '' }; // Would normally be TRIANGULATION
      const result = classifyVerificationLens(item, { lensOverride: 'DEBATE' });
      expect(result.lens).toBe(VERIFICATION_LENS.DEBATE);
      expect(result.confidence).toBe(1.0);
      expect(result.original_lens).toBe(VERIFICATION_LENS.TRIANGULATION);
      expect(result.override_lens).toBe(VERIFICATION_LENS.DEBATE);
    });

    it('ignores invalid override values', () => {
      const item = { title: 'The endpoint is broken', description: '' };
      const result = classifyVerificationLens(item, { lensOverride: 'INVALID' });
      expect(result.lens).toBe(VERIFICATION_LENS.TRIANGULATION);
      expect(result.override_lens).toBeUndefined();
    });
  });

  describe('confidence scoring', () => {
    it('returns higher confidence for strong signals', () => {
      // Multiple triangulation keywords
      const item = {
        title: 'The endpoint is not working',
        description: 'The function fails when the file is missing from the migration table'
      };
      const result = classifyVerificationLens(item);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('returns lower confidence for weak signals', () => {
      const item = { title: 'Something needs attention', description: '' };
      const result = classifyVerificationLens(item);
      expect(result.confidence).toBeLessThan(0.7);
    });
  });
});
