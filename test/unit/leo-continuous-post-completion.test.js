/**
 * Unit Tests: leo-continuous.js Post-Completion Integration
 *
 * Tests the post-completion sequence integration in leo-continuous.js.
 *
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-N
 */

import { describe, it, expect } from 'vitest';

// Test the post-completion requirements module integration
import {
  getPostCompletionRequirements,
  getPostCompletionSequence,
  shouldSkipLearn
} from '../../lib/utils/post-completion-requirements.js';

describe('leo-continuous Post-Completion Integration', () => {
  describe('Post-completion requirements integration', () => {
    it('should return full sequence for feature SDs', () => {
      const requirements = getPostCompletionRequirements('feature');
      const sequence = getPostCompletionSequence('feature');

      expect(requirements.sequenceType).toBe('full');
      expect(sequence).toContain('ship');
      expect(requirements.ship).toBe(true);
    });

    it('should return minimal sequence for infrastructure SDs', () => {
      const requirements = getPostCompletionRequirements('infrastructure');
      const sequence = getPostCompletionSequence('infrastructure');

      expect(requirements.sequenceType).toBe('minimal');
      expect(sequence).toContain('ship');
      expect(sequence).not.toContain('learn');
      expect(requirements.learn).toBe(false);
    });

    it('should return minimal sequence for orchestrator SDs', () => {
      const requirements = getPostCompletionRequirements('orchestrator');
      const sequence = getPostCompletionSequence('orchestrator');

      expect(requirements.sequenceType).toBe('minimal');
      expect(requirements.heal).toBe(false);
      expect(sequence.length).toBe(1);
      expect(sequence[0]).toBe('ship');
    });

    it('should skip learn for SDs created by learn command', () => {
      const requirements = getPostCompletionRequirements('feature', { source: 'learn' });

      expect(requirements.learn).toBe(false);
      expect(requirements.skipLearnReason).toContain('learn');
    });

    it('should skip learn for quick-fix SDs', () => {
      const sd = { sd_type: 'bugfix', source: 'quick-fix' };
      const result = shouldSkipLearn(sd);

      expect(result.skip).toBe(true);
      expect(result.reason).toContain('quick-fix');
    });
  });

  describe('Sequence ordering', () => {
    it('should have restart before ship for feature SDs', () => {
      const sequence = getPostCompletionSequence('feature', { hasUIChanges: true });

      if (sequence.includes('restart')) {
        const restartIdx = sequence.indexOf('restart');
        const shipIdx = sequence.indexOf('ship');
        expect(restartIdx).toBeLessThan(shipIdx);
      }
    });

    it('should have heal after ship', () => {
      const sequence = getPostCompletionSequence('feature');

      if (sequence.includes('heal')) {
        const healIdx = sequence.indexOf('heal');
        const shipIdx = sequence.indexOf('ship');
        expect(healIdx).toBeGreaterThan(shipIdx);
      }
    });

    it('should have learn at the end', () => {
      const sequence = getPostCompletionSequence('feature');

      if (sequence.includes('learn')) {
        const learnIdx = sequence.indexOf('learn');
        expect(learnIdx).toBe(sequence.length - 1);
      }
    });

    it('should have heal before learn', () => {
      const sequence = getPostCompletionSequence('feature');

      if (sequence.includes('heal') && sequence.includes('learn')) {
        const healIdx = sequence.indexOf('heal');
        const learnIdx = sequence.indexOf('learn');
        expect(healIdx).toBeLessThan(learnIdx);
      }
    });
  });

  describe('SD type coverage', () => {
    const sdTypes = [
      'feature',
      'bugfix',
      'security',
      'enhancement',
      'refactor',
      'performance',
      'infrastructure',
      'documentation',
      'orchestrator',
      'database'
    ];

    sdTypes.forEach(sdType => {
      it(`should handle ${sdType} SD type`, () => {
        const requirements = getPostCompletionRequirements(sdType);
        const sequence = getPostCompletionSequence(sdType);

        // All SD types should have sdType property
        expect(requirements.sdType).toBe(sdType.toLowerCase());

        // All SD types should have sequenceType
        expect(['full', 'minimal']).toContain(requirements.sequenceType);

        // All SD types should have at least ship command
        expect(sequence).toContain('ship');
        expect(sequence.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
