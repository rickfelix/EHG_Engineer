/**
 * Unit Tests for Post-Completion Requirements (Vision QA Integration)
 * SD: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001
 *
 * Tests: getPostCompletionRequirements, getPostCompletionSequence,
 * shouldSkipLearn, Vision QA conditional logic.
 */

import {
  getPostCompletionRequirements,
  getPostCompletionSequence,
  shouldSkipLearn,
  FULL_SEQUENCE_TYPES,
  MINIMAL_SEQUENCE_TYPES,
  LEARN_SKIP_SOURCES,
  HEAL_SKIP_SOURCES,
  SD_TYPE_DOC_DIRECTORIES
} from '../../../lib/utils/post-completion-requirements.js';

// ============================================================================
// TEST GROUP 1: Vision QA in post-completion requirements
// ============================================================================
describe('getPostCompletionRequirements() - Vision QA', () => {
  it('should enable visionQA for feature SD with UI changes and AUTO-PROCEED', () => {
    const req = getPostCompletionRequirements('feature', {
      hasUIChanges: true,
      autoProceed: true
    });
    expect(req.visionQA).toBe(true);
  });

  it('should disable visionQA when AUTO-PROCEED is off', () => {
    const req = getPostCompletionRequirements('feature', {
      hasUIChanges: true,
      autoProceed: false
    });
    expect(req.visionQA).toBe(false);
    expect(req.visionQASkipReason).toBe('AUTO-PROCEED not active');
  });

  it('should disable visionQA when no UI changes', () => {
    const req = getPostCompletionRequirements('feature', {
      hasUIChanges: false,
      autoProceed: true
    });
    expect(req.visionQA).toBe(false);
    expect(req.visionQASkipReason).toBe('no UI changes detected');
  });

  it('should disable visionQA for minimal sequence types', () => {
    const req = getPostCompletionRequirements('infrastructure', {
      hasUIChanges: true,
      autoProceed: true
    });
    expect(req.visionQA).toBe(false);
    expect(req.visionQASkipReason).toBe('minimal sequence SD');
  });

  it('should disable visionQA for documentation SD', () => {
    const req = getPostCompletionRequirements('documentation', {
      hasUIChanges: true,
      autoProceed: true
    });
    expect(req.visionQA).toBe(false);
  });

  it('should enable visionQA for bugfix SD with UI changes and AUTO-PROCEED', () => {
    const req = getPostCompletionRequirements('bugfix', {
      hasUIChanges: true,
      autoProceed: true
    });
    expect(req.visionQA).toBe(true);
  });

  it('should enable visionQA for enhancement SD with UI changes and AUTO-PROCEED', () => {
    const req = getPostCompletionRequirements('enhancement', {
      hasUIChanges: true,
      autoProceed: true
    });
    expect(req.visionQA).toBe(true);
  });

  it('should enable visionQA for security SD with UI changes and AUTO-PROCEED', () => {
    const req = getPostCompletionRequirements('security', {
      hasUIChanges: true,
      autoProceed: true
    });
    expect(req.visionQA).toBe(true);
  });

  it('should default autoProceed to false', () => {
    const req = getPostCompletionRequirements('feature', {
      hasUIChanges: true
    });
    expect(req.visionQA).toBe(false);
  });

  it('should default hasUIChanges to false', () => {
    const req = getPostCompletionRequirements('feature', {
      autoProceed: true
    });
    expect(req.visionQA).toBe(false);
  });
});

// ============================================================================
// TEST GROUP 2: Post-completion sequence with Vision QA
// ============================================================================
describe('getPostCompletionSequence() - Vision QA step', () => {
  it('should include vision-qa in sequence for UI-touching feature SD', () => {
    const seq = getPostCompletionSequence('feature', {
      hasUIChanges: true,
      autoProceed: true
    });
    expect(seq).toContain('vision-qa');
  });

  it('should place vision-qa after restart and before document', () => {
    const seq = getPostCompletionSequence('feature', {
      hasUIChanges: true,
      autoProceed: true
    });
    const restartIdx = seq.indexOf('restart');
    const visionIdx = seq.indexOf('vision-qa');
    const docIdx = seq.indexOf('document');
    const shipIdx = seq.indexOf('ship');

    expect(restartIdx).toBeLessThan(visionIdx);
    expect(visionIdx).toBeLessThan(docIdx);
    expect(docIdx).toBeLessThan(shipIdx);
  });

  it('should not include vision-qa for backend-only feature SD', () => {
    const seq = getPostCompletionSequence('feature', {
      hasUIChanges: false,
      autoProceed: true
    });
    expect(seq).not.toContain('vision-qa');
  });

  it('should not include vision-qa for infrastructure SD', () => {
    const seq = getPostCompletionSequence('infrastructure', {
      hasUIChanges: true,
      autoProceed: true
    });
    expect(seq).not.toContain('vision-qa');
    expect(seq).toContain('document'); // infrastructure now gets document
  });

  it('should produce full sequence: restart -> vision-qa -> document -> ship -> heal -> learn', () => {
    const seq = getPostCompletionSequence('feature', {
      hasUIChanges: true,
      autoProceed: true
    });
    expect(seq).toEqual(['restart', 'vision-qa', 'document', 'ship', 'heal', 'learn']);
  });

  it('should produce sequence without vision-qa: restart -> document -> ship -> heal -> learn', () => {
    const seq = getPostCompletionSequence('feature', {
      hasUIChanges: false,
      autoProceed: true
    });
    expect(seq).toEqual(['restart', 'document', 'ship', 'heal', 'learn']);
  });

  it('should produce sequence with document for infrastructure', () => {
    const seq = getPostCompletionSequence('infrastructure');
    expect(seq).toEqual(['document', 'ship']);
  });
});

// ============================================================================
// TEST GROUP 3: Full sequence type requirements
// ============================================================================
describe('getPostCompletionRequirements() - full sequence types', () => {
  for (const sdType of FULL_SEQUENCE_TYPES) {
    it(`should return full sequence for ${sdType}`, () => {
      const req = getPostCompletionRequirements(sdType);
      expect(req.sequenceType).toBe('full');
    });
  }
});

// ============================================================================
// TEST GROUP 4: Minimal sequence type requirements
// ============================================================================
describe('getPostCompletionRequirements() - minimal sequence types', () => {
  for (const sdType of MINIMAL_SEQUENCE_TYPES) {
    it(`should return minimal sequence for ${sdType}`, () => {
      const req = getPostCompletionRequirements(sdType);
      expect(req.sequenceType).toBe('minimal');
    });
  }
});

// ============================================================================
// TEST GROUP 5: shouldSkipLearn
// ============================================================================
describe('shouldSkipLearn()', () => {
  it('should skip learn for "learn" source', () => {
    const result = shouldSkipLearn({ source: 'learn', sd_type: 'feature' });
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('learn');
  });

  it('should skip learn for "quick-fix" source', () => {
    const result = shouldSkipLearn({ source: 'quick-fix', sd_type: 'feature' });
    expect(result.skip).toBe(true);
  });

  it('should skip learn for "rca" source', () => {
    const result = shouldSkipLearn({ source: 'rca', sd_type: 'feature' });
    expect(result.skip).toBe(true);
  });

  it('should skip learn for documentation SD type', () => {
    const result = shouldSkipLearn({ source: '', sd_type: 'documentation' });
    expect(result.skip).toBe(true);
  });

  it('should skip learn for infrastructure SD type', () => {
    const result = shouldSkipLearn({ source: '', sd_type: 'infrastructure' });
    expect(result.skip).toBe(true);
  });

  it('should NOT skip learn for normal feature SD', () => {
    const result = shouldSkipLearn({ source: '', sd_type: 'feature' });
    expect(result.skip).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('should handle missing source', () => {
    const result = shouldSkipLearn({ sd_type: 'feature' });
    expect(result.skip).toBe(false);
  });

  it('should handle missing sd_type (defaults to feature)', () => {
    const result = shouldSkipLearn({});
    expect(result.skip).toBe(false);
  });
});

// ============================================================================
// TEST GROUP 6: Constants
// ============================================================================
describe('Exported constants', () => {
  it('should export FULL_SEQUENCE_TYPES as array', () => {
    expect(Array.isArray(FULL_SEQUENCE_TYPES)).toBe(true);
    expect(FULL_SEQUENCE_TYPES).toContain('feature');
    expect(FULL_SEQUENCE_TYPES).toContain('bugfix');
  });

  it('should export MINIMAL_SEQUENCE_TYPES as array', () => {
    expect(Array.isArray(MINIMAL_SEQUENCE_TYPES)).toBe(true);
    expect(MINIMAL_SEQUENCE_TYPES).toContain('infrastructure');
    expect(MINIMAL_SEQUENCE_TYPES).toContain('documentation');
  });

  it('should export LEARN_SKIP_SOURCES as array', () => {
    expect(Array.isArray(LEARN_SKIP_SOURCES)).toBe(true);
    expect(LEARN_SKIP_SOURCES).toContain('learn');
    expect(LEARN_SKIP_SOURCES).toContain('quick-fix');
  });

  it('should export HEAL_SKIP_SOURCES as array', () => {
    expect(Array.isArray(HEAL_SKIP_SOURCES)).toBe(true);
    expect(HEAL_SKIP_SOURCES).toContain('heal');
    expect(HEAL_SKIP_SOURCES).toContain('corrective');
  });

  it('should export SD_TYPE_DOC_DIRECTORIES mapping', () => {
    expect(typeof SD_TYPE_DOC_DIRECTORIES).toBe('object');
    expect(SD_TYPE_DOC_DIRECTORIES.feature).toContain('docs/04_features/');
    expect(SD_TYPE_DOC_DIRECTORIES.database).toContain('docs/database/');
    expect(SD_TYPE_DOC_DIRECTORIES.infrastructure).toContain('docs/06_deployment/');
    expect(SD_TYPE_DOC_DIRECTORIES).not.toHaveProperty('orchestrator');
  });
});

// ============================================================================
// TEST GROUP 7: Restart requirements
// ============================================================================
describe('getPostCompletionRequirements() - restart', () => {
  it('should require restart for feature SD (always)', () => {
    const req = getPostCompletionRequirements('feature');
    expect(req.restart).toBe(true);
  });

  it('should require restart for enhancement with UI changes', () => {
    const req = getPostCompletionRequirements('enhancement', { hasUIChanges: true });
    expect(req.restart).toBe(true);
  });

  it('should NOT require restart for enhancement without UI changes', () => {
    const req = getPostCompletionRequirements('enhancement', { hasUIChanges: false });
    expect(req.restart).toBe(false);
  });

  it('should NOT require restart for infrastructure SD', () => {
    const req = getPostCompletionRequirements('infrastructure');
    expect(req.restart).toBe(false);
  });

  it('should NOT require restart for documentation SD', () => {
    const req = getPostCompletionRequirements('documentation');
    expect(req.restart).toBe(false);
  });
});
