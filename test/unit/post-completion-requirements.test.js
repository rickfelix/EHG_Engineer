/**
 * Unit Tests: Post-Completion Requirements
 *
 * Tests the SD-type-aware post-completion requirements logic.
 *
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-A
 */

import { describe, it, expect } from 'vitest';
import {
  getPostCompletionRequirements,
  getPostCompletionSequence,
  shouldSkipLearn,
  getPostCompletionRequirementsFromSD,
  FULL_SEQUENCE_TYPES,
  MINIMAL_SEQUENCE_TYPES,
  LEARN_SKIP_SOURCES
} from '../../lib/utils/post-completion-requirements.js';

describe('Post-Completion Requirements', () => {
  describe('getPostCompletionRequirements', () => {
    describe('Full sequence SD types (feature, bugfix, security, refactor, enhancement)', () => {
      it('should return full sequence for feature SD', () => {
        const reqs = getPostCompletionRequirements('feature');

        expect(reqs.restart).toBe(true);
        expect(reqs.ship).toBe(true);
        expect(reqs.document).toBe(true);
        expect(reqs.learn).toBe(true);
        expect(reqs.sequenceType).toBe('full');
      });

      it('should return full sequence for bugfix SD (no restart without UI)', () => {
        const reqs = getPostCompletionRequirements('bugfix');

        // Bugfix doesn't need restart unless hasUIChanges is true
        expect(reqs.restart).toBe(false);
        expect(reqs.ship).toBe(true);
        expect(reqs.document).toBe(false); // bugfix doesn't need document
        expect(reqs.learn).toBe(true);
        expect(reqs.sequenceType).toBe('full');
      });

      it('should return full sequence for bugfix SD with UI changes', () => {
        const reqs = getPostCompletionRequirements('bugfix', { hasUIChanges: true });

        // Bugfix WITH UI changes needs restart
        expect(reqs.restart).toBe(true);
        expect(reqs.ship).toBe(true);
      });

      it('should return full sequence for security SD (no restart without UI)', () => {
        const reqs = getPostCompletionRequirements('security');

        // Security doesn't need restart unless hasUIChanges is true
        expect(reqs.restart).toBe(false);
        expect(reqs.ship).toBe(true);
        // Security changes need docs for feature/enhancement/security types
        expect(reqs.document).toBe(true);
        expect(reqs.learn).toBe(true);
      });

      it('should return full sequence for enhancement SD (no restart without UI)', () => {
        const reqs = getPostCompletionRequirements('enhancement');

        // Enhancement doesn't need restart unless it's feature type or has UI
        expect(reqs.restart).toBe(false);
        expect(reqs.ship).toBe(true);
        expect(reqs.document).toBe(true);
        expect(reqs.learn).toBe(true);
      });

      it('should return full sequence for refactor SD', () => {
        const reqs = getPostCompletionRequirements('refactor');

        expect(reqs.ship).toBe(true);
        expect(reqs.learn).toBe(true);
        expect(reqs.document).toBe(false); // refactor doesn't need new docs
      });
    });

    describe('Minimal sequence SD types (documentation, orchestrator, infrastructure)', () => {
      it('should return minimal sequence for documentation SD', () => {
        const reqs = getPostCompletionRequirements('documentation');

        expect(reqs.restart).toBe(false);
        expect(reqs.ship).toBe(true);
        expect(reqs.document).toBe(false);
        expect(reqs.learn).toBe(false);
        expect(reqs.sequenceType).toBe('minimal');
      });

      it('should return minimal sequence for orchestrator SD', () => {
        const reqs = getPostCompletionRequirements('orchestrator');

        expect(reqs.restart).toBe(false);
        expect(reqs.ship).toBe(true);
        expect(reqs.document).toBe(false);
        expect(reqs.learn).toBe(false);
        expect(reqs.sequenceType).toBe('minimal');
      });

      it('should return minimal sequence for infrastructure SD', () => {
        const reqs = getPostCompletionRequirements('infrastructure');

        expect(reqs.restart).toBe(false);
        expect(reqs.ship).toBe(true);
        expect(reqs.document).toBe(false);
        expect(reqs.learn).toBe(false);
        expect(reqs.sequenceType).toBe('minimal');
      });

      it('should return minimal sequence for database SD', () => {
        const reqs = getPostCompletionRequirements('database');

        expect(reqs.restart).toBe(false);
        expect(reqs.ship).toBe(true);
        expect(reqs.document).toBe(false);
        expect(reqs.learn).toBe(false);
        expect(reqs.sequenceType).toBe('minimal');
      });
    });

    describe('Learn skip based on source', () => {
      it('should skip learn for source=learn', () => {
        const reqs = getPostCompletionRequirements('feature', { source: 'learn' });

        expect(reqs.learn).toBe(false);
        expect(reqs.skipLearnReason).toContain('learn');
      });

      it('should skip learn for source=quick-fix', () => {
        const reqs = getPostCompletionRequirements('feature', { source: 'quick-fix' });

        expect(reqs.learn).toBe(false);
        expect(reqs.skipLearnReason).toContain('quick-fix');
      });

      it('should skip learn for source=escalation', () => {
        const reqs = getPostCompletionRequirements('feature', { source: 'escalation' });

        expect(reqs.learn).toBe(false);
        expect(reqs.skipLearnReason).toContain('escalation');
      });

      it('should NOT skip learn for normal sources', () => {
        const reqs = getPostCompletionRequirements('feature', { source: '' });

        expect(reqs.learn).toBe(true);
        expect(reqs.skipLearnReason).toBeNull();
      });
    });

    describe('Default behavior', () => {
      it('should default to feature type when not specified', () => {
        const reqs = getPostCompletionRequirements(null);

        expect(reqs.sdType).toBe('feature');
        expect(reqs.sequenceType).toBe('full');
      });

      it('should handle case-insensitive SD types', () => {
        const reqs = getPostCompletionRequirements('FEATURE');

        expect(reqs.sequenceType).toBe('full');
        expect(reqs.sdType).toBe('feature');
      });
    });
  });

  describe('getPostCompletionSequence', () => {
    it('should return correct sequence for feature SD', () => {
      const sequence = getPostCompletionSequence('feature');

      expect(sequence).toEqual(['restart', 'ship', 'document', 'learn']);
    });

    it('should return minimal sequence for infrastructure SD', () => {
      const sequence = getPostCompletionSequence('infrastructure');

      expect(sequence).toEqual(['ship']);
    });

    it('should return sequence without learn for learn-source SD', () => {
      const sequence = getPostCompletionSequence('feature', { source: 'learn' });

      expect(sequence).toContain('ship');
      expect(sequence).not.toContain('learn');
    });

    it('should return correct order: restart -> ship -> document -> learn', () => {
      const sequence = getPostCompletionSequence('feature');

      const restartIndex = sequence.indexOf('restart');
      const shipIndex = sequence.indexOf('ship');
      const documentIndex = sequence.indexOf('document');
      const learnIndex = sequence.indexOf('learn');

      expect(restartIndex).toBeLessThan(shipIndex);
      expect(shipIndex).toBeLessThan(documentIndex);
      expect(documentIndex).toBeLessThan(learnIndex);
    });
  });

  describe('shouldSkipLearn', () => {
    it('should skip learn for SD with source=learn', () => {
      const result = shouldSkipLearn({ source: 'learn', sd_type: 'feature' });

      expect(result.skip).toBe(true);
      expect(result.reason).toContain('learn');
    });

    it('should skip learn for SD with source=quick-fix', () => {
      const result = shouldSkipLearn({ source: 'quick-fix', sd_type: 'feature' });

      expect(result.skip).toBe(true);
    });

    it('should skip learn for infrastructure SD', () => {
      const result = shouldSkipLearn({ source: '', sd_type: 'infrastructure' });

      expect(result.skip).toBe(true);
      expect(result.reason).toContain('minimal');
    });

    it('should NOT skip learn for normal feature SD', () => {
      const result = shouldSkipLearn({ source: '', sd_type: 'feature' });

      expect(result.skip).toBe(false);
      expect(result.reason).toBeNull();
    });
  });

  describe('getPostCompletionRequirementsFromSD', () => {
    it('should extract requirements from SD object', () => {
      const sd = {
        sd_type: 'feature',
        source: '',
        scope: 'Add new UI component'
      };

      const reqs = getPostCompletionRequirementsFromSD(sd);

      expect(reqs.restart).toBe(true);
      expect(reqs.ship).toBe(true);
      expect(reqs.document).toBe(true);
      expect(reqs.learn).toBe(true);
    });

    it('should detect UI changes from scope', () => {
      const sd = {
        sd_type: 'feature',
        scope: 'Add dashboard component'
      };

      const reqs = getPostCompletionRequirementsFromSD(sd);

      expect(reqs.restart).toBe(true); // Has UI changes
    });

    it('should throw error if SD is null', () => {
      expect(() => getPostCompletionRequirementsFromSD(null)).toThrow('SD object is required');
    });

    it('should default to feature type if sd_type not set', () => {
      const sd = { scope: 'Some work' };

      const reqs = getPostCompletionRequirementsFromSD(sd);

      expect(reqs.sdType).toBe('feature');
    });
  });

  describe('Exported constants', () => {
    it('should export FULL_SEQUENCE_TYPES array', () => {
      expect(Array.isArray(FULL_SEQUENCE_TYPES)).toBe(true);
      expect(FULL_SEQUENCE_TYPES.length).toBeGreaterThan(0);
      // Check that feature is in the list (it's always code-producing)
      expect(FULL_SEQUENCE_TYPES).toContain('feature');
    });

    it('should export MINIMAL_SEQUENCE_TYPES array', () => {
      expect(Array.isArray(MINIMAL_SEQUENCE_TYPES)).toBe(true);
      expect(MINIMAL_SEQUENCE_TYPES.length).toBeGreaterThan(0);
      // Check that infrastructure is in the list (it's always non-code)
      expect(MINIMAL_SEQUENCE_TYPES).toContain('infrastructure');
    });

    it('should export LEARN_SKIP_SOURCES array', () => {
      expect(Array.isArray(LEARN_SKIP_SOURCES)).toBe(true);
      expect(LEARN_SKIP_SOURCES).toContain('learn');
      expect(LEARN_SKIP_SOURCES).toContain('quick-fix');
      expect(LEARN_SKIP_SOURCES).toContain('escalation');
    });
  });
});
