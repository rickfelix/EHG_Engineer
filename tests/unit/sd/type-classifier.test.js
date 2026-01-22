/**
 * Unit Tests: SD Type Classifier
 *
 * Tests for SD-LEO-FEAT-LLM-ASSISTED-TYPE-001
 *
 * @module tests/unit/sd/type-classifier.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SDTypeClassifier, SD_TYPE_PROFILES } from '../../../lib/sd/type-classifier.js';

describe('SDTypeClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = new SDTypeClassifier();
  });

  describe('SD_TYPE_PROFILES', () => {
    it('should have all expected SD types defined', () => {
      expect(SD_TYPE_PROFILES.feature).toBeDefined();
      expect(SD_TYPE_PROFILES.infrastructure).toBeDefined();
      expect(SD_TYPE_PROFILES.library).toBeDefined();
      expect(SD_TYPE_PROFILES.fix).toBeDefined();
      expect(SD_TYPE_PROFILES.enhancement).toBeDefined();
      expect(SD_TYPE_PROFILES.documentation).toBeDefined();
      expect(SD_TYPE_PROFILES.refactor).toBeDefined();
      expect(SD_TYPE_PROFILES.security).toBeDefined();
    });

    it('should have correct gate thresholds', () => {
      expect(SD_TYPE_PROFILES.feature.gateThreshold).toBe(85);
      expect(SD_TYPE_PROFILES.infrastructure.gateThreshold).toBe(80);
      expect(SD_TYPE_PROFILES.library.gateThreshold).toBe(75);
      expect(SD_TYPE_PROFILES.fix.gateThreshold).toBe(70);
      expect(SD_TYPE_PROFILES.security.gateThreshold).toBe(90);
    });

    it('should have correct validation requirements', () => {
      // Feature requires everything
      expect(SD_TYPE_PROFILES.feature.prdRequired).toBe(true);
      expect(SD_TYPE_PROFILES.feature.e2eRequired).toBe(true);
      expect(SD_TYPE_PROFILES.feature.designRequired).toBe(true);

      // Infrastructure has relaxed requirements
      expect(SD_TYPE_PROFILES.infrastructure.prdRequired).toBe(true);
      expect(SD_TYPE_PROFILES.infrastructure.e2eRequired).toBe(false);
      expect(SD_TYPE_PROFILES.infrastructure.designRequired).toBe(false);

      // Library is minimal
      expect(SD_TYPE_PROFILES.library.prdRequired).toBe(false);
      expect(SD_TYPE_PROFILES.library.e2eRequired).toBe(false);
      expect(SD_TYPE_PROFILES.library.designRequired).toBe(false);

      // Fix is minimal
      expect(SD_TYPE_PROFILES.fix.prdRequired).toBe(false);
      expect(SD_TYPE_PROFILES.fix.e2eRequired).toBe(false);

      // Security is strict
      expect(SD_TYPE_PROFILES.security.prdRequired).toBe(true);
      expect(SD_TYPE_PROFILES.security.e2eRequired).toBe(true);
    });
  });

  describe('classifyByKeywords()', () => {
    it('should classify UI-related SDs as feature', () => {
      const result = classifier.classifyByKeywords(
        'Add user dashboard page',
        'Create a new dashboard page with charts and user metrics'
      );

      expect(result.recommendedType).toBe('feature');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify script-related SDs as infrastructure', () => {
      const result = classifier.classifyByKeywords(
        'Add deployment pipeline script',
        'Create CI/CD pipeline for automated deployments'
      );

      expect(result.recommendedType).toBe('infrastructure');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify utility modules as library', () => {
      const result = classifier.classifyByKeywords(
        'Create validation helper module',
        'Reusable validation utility functions for form inputs'
      );

      expect(result.recommendedType).toBe('library');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify bug fixes as fix', () => {
      const result = classifier.classifyByKeywords(
        'Fix login error',
        'Users are getting an error when trying to log in'
      );

      expect(result.recommendedType).toBe('fix');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify auth-related SDs as security', () => {
      const result = classifier.classifyByKeywords(
        'Implement RLS policies for user data',
        'Add row-level security to protect user credentials and permissions'
      );

      expect(result.recommendedType).toBe('security');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should default to infrastructure when no keywords match', () => {
      const result = classifier.classifyByKeywords(
        'Arbitrary work item',
        'Something without any recognizable patterns'
      );

      expect(result.recommendedType).toBe('infrastructure');
      expect(result.confidence).toBeLessThanOrEqual(0.7);
    });

    it('should detect UI presence in analysis', () => {
      const result = classifier.classifyByKeywords(
        'Add button to form',
        'User interface improvement'
      );

      expect(result.analysis.hasUI).toBe(true);
    });

    it('should detect API presence in analysis', () => {
      const result = classifier.classifyByKeywords(
        'Add new API endpoint',
        'REST API for data retrieval'
      );

      expect(result.analysis.hasAPIEndpoints).toBe(true);
    });
  });

  describe('normalizeType()', () => {
    it('should return valid types unchanged', () => {
      expect(classifier.normalizeType('feature')).toBe('feature');
      expect(classifier.normalizeType('infrastructure')).toBe('infrastructure');
      expect(classifier.normalizeType('library')).toBe('library');
    });

    it('should normalize common variations', () => {
      expect(classifier.normalizeType('bugfix')).toBe('fix');
      expect(classifier.normalizeType('bug_fix')).toBe('fix');
      expect(classifier.normalizeType('bug-fix')).toBe('fix');
      expect(classifier.normalizeType('hotfix')).toBe('fix');
    });

    it('should normalize abbreviations', () => {
      expect(classifier.normalizeType('feat')).toBe('feature');
      expect(classifier.normalizeType('infra')).toBe('infrastructure');
      expect(classifier.normalizeType('lib')).toBe('library');
      expect(classifier.normalizeType('doc')).toBe('documentation');
      expect(classifier.normalizeType('docs')).toBe('documentation');
    });

    it('should handle case insensitivity', () => {
      expect(classifier.normalizeType('FEATURE')).toBe('feature');
      expect(classifier.normalizeType('Infrastructure')).toBe('infrastructure');
      expect(classifier.normalizeType('FIX')).toBe('fix');
    });

    it('should default to infrastructure for unknown types', () => {
      expect(classifier.normalizeType('unknown')).toBe('infrastructure');
      expect(classifier.normalizeType('random')).toBe('infrastructure');
    });
  });

  describe('getProfile()', () => {
    it('should return correct profile for known types', () => {
      const featureProfile = classifier.getProfile('feature');
      expect(featureProfile.name).toBe('Feature');
      expect(featureProfile.gateThreshold).toBe(85);

      const infraProfile = classifier.getProfile('infrastructure');
      expect(infraProfile.name).toBe('Infrastructure');
      expect(infraProfile.gateThreshold).toBe(80);
    });

    it('should return infrastructure profile for unknown types', () => {
      const unknownProfile = classifier.getProfile('unknown_type');
      expect(unknownProfile.name).toBe('Infrastructure');
    });
  });

  describe('isValidationRequired()', () => {
    it('should correctly identify PRD requirements', () => {
      expect(classifier.isValidationRequired('feature', 'prd')).toBe(true);
      expect(classifier.isValidationRequired('infrastructure', 'prd')).toBe(true);
      expect(classifier.isValidationRequired('library', 'prd')).toBe(false);
      expect(classifier.isValidationRequired('fix', 'prd')).toBe(false);
    });

    it('should correctly identify E2E requirements', () => {
      expect(classifier.isValidationRequired('feature', 'e2e')).toBe(true);
      expect(classifier.isValidationRequired('infrastructure', 'e2e')).toBe(false);
      expect(classifier.isValidationRequired('refactor', 'e2e')).toBe(true);
      expect(classifier.isValidationRequired('security', 'e2e')).toBe(true);
    });

    it('should correctly identify DESIGN requirements', () => {
      expect(classifier.isValidationRequired('feature', 'design')).toBe(true);
      expect(classifier.isValidationRequired('infrastructure', 'design')).toBe(false);
      expect(classifier.isValidationRequired('library', 'design')).toBe(false);
    });

    it('should return true for unknown validation types', () => {
      expect(classifier.isValidationRequired('feature', 'unknown')).toBe(true);
    });
  });

  describe('formatForDisplay()', () => {
    it('should format classification result correctly', () => {
      const result = {
        recommendedType: 'feature',
        confidence: 0.92,
        reasoning: 'Has UI components',
        profile: SD_TYPE_PROFILES.feature
      };

      const formatted = classifier.formatForDisplay(result);

      expect(formatted.type).toBe('feature');
      expect(formatted.typeName).toBe('Feature');
      expect(formatted.confidence).toBe('92%');
      expect(formatted.reasoning).toBe('Has UI components');
      expect(formatted.implications).toContain('PRD required');
      expect(formatted.implications).toContain('E2E tests required');
      expect(formatted.implications).toContain('DESIGN sub-agent required');
      expect(formatted.implications).toContain('85% gate threshold');
      expect(formatted.subAgents).toContain('DESIGN');
      expect(formatted.subAgents).toContain('TESTING');
    });

    it('should format infrastructure type correctly', () => {
      const result = {
        recommendedType: 'infrastructure',
        confidence: 0.85,
        reasoning: 'Backend processing',
        profile: SD_TYPE_PROFILES.infrastructure
      };

      const formatted = classifier.formatForDisplay(result);

      expect(formatted.implications).not.toContain('E2E tests required');
      expect(formatted.implications).not.toContain('DESIGN sub-agent required');
      expect(formatted.implications).toContain('80% gate threshold');
    });
  });

  describe('buildClassificationPrompt()', () => {
    it('should include all SD types in prompt', () => {
      const prompt = classifier.buildClassificationPrompt('Test', 'Description');

      expect(prompt.system).toContain('feature');
      expect(prompt.system).toContain('infrastructure');
      expect(prompt.system).toContain('library');
      expect(prompt.system).toContain('fix');
      expect(prompt.system).toContain('security');
    });

    it('should include title and description in user prompt', () => {
      const prompt = classifier.buildClassificationPrompt(
        'My Test SD',
        'This is a test description'
      );

      expect(prompt.user).toContain('My Test SD');
      expect(prompt.user).toContain('This is a test description');
    });

    it('should handle missing description', () => {
      const prompt = classifier.buildClassificationPrompt('Test', '');

      expect(prompt.user).toContain('No description provided');
    });
  });
});

describe('Integration: Full Classification Flow', () => {
  let classifier;

  beforeEach(() => {
    classifier = new SDTypeClassifier();
  });

  it('should classify backend classification module as infrastructure/library', async () => {
    const result = classifier.classifyByKeywords(
      'Multi-Model Classification Module',
      'Backend library for classifying data using GPT and Gemini APIs'
    );

    // Should be infrastructure or library since it's a backend module
    expect(['infrastructure', 'library']).toContain(result.recommendedType);
    expect(result.analysis.hasUI).toBe(false);
  });

  it('should classify user dashboard as feature', async () => {
    const result = classifier.classifyByKeywords(
      'Add User Profile Dashboard',
      'Create a new page with user profile information, settings form, and activity display'
    );

    expect(result.recommendedType).toBe('feature');
    expect(result.analysis.hasUI).toBe(true);
  });

  it('should classify RLS policy work as security', async () => {
    const result = classifier.classifyByKeywords(
      'Implement Row-Level Security for Ventures',
      'Add RLS policies to protect venture data with user authentication checks'
    );

    expect(result.recommendedType).toBe('security');
  });

  it('should classify code cleanup as refactor', async () => {
    const result = classifier.classifyByKeywords(
      'Refactor Authentication Module',
      'Clean up and reorganize the auth code for better maintainability'
    );

    expect(result.recommendedType).toBe('refactor');
  });
});
