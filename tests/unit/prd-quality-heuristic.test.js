/**
 * Unit Tests for PRD Quality Heuristic Validation
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-030: SD-type-aware scoring
 *
 * Tests that infrastructure/fix SDs get reduced penalties for optional fields
 * while feature SDs retain standard scoring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the rubric module to avoid AI calls
vi.mock('../../scripts/modules/rubrics/prd-quality-rubric.js', () => ({
  PRDQualityRubric: vi.fn()
}));

const { validatePRDQuality } = await import('../../scripts/modules/prd-quality-validation.js');

/**
 * Build a minimal PRD that passes all checks at 100
 */
function buildFullPRD() {
  return {
    id: 'PRD-TEST-001',
    functional_requirements: [
      { requirement: 'Implement authentication via OAuth 2.0' },
      { requirement: 'Create user profile management API' },
      { requirement: 'Add session token refresh mechanism' }
    ],
    acceptance_criteria: [
      'Users can log in with Google OAuth',
      'Profile page displays user information',
      'Tokens refresh automatically before expiry'
    ],
    test_scenarios: [
      { scenario: 'Login with valid credentials' },
      { scenario: 'Handle expired tokens gracefully' },
      { scenario: 'Display error for invalid OAuth callback' }
    ],
    system_architecture: { components: ['auth-service', 'token-manager'] },
    implementation_approach: { strategy: 'OAuth 2.0 with PKCE flow' },
    risks: [{ risk: 'Token theft via XSS', mitigation: 'Use httpOnly cookies' }],
    executive_summary: 'Implement OAuth 2.0 authentication with token management and user profiles for the application.'
  };
}

/**
 * Build a PRD missing optional fields (system_architecture, implementation_approach, risks)
 * but with valid core fields
 */
function buildMinimalPRD() {
  return {
    id: 'PRD-TEST-002',
    functional_requirements: [
      { requirement: 'Fix gate validation scoring for infrastructure SDs' },
      { requirement: 'Add cross-mode fallback for protocol file read gate' },
      { requirement: 'Update issue patterns with assigned SD ID' }
    ],
    acceptance_criteria: [
      'Infrastructure PRDs score >= 70 without system_architecture',
      'Protocol file read gate falls back to FULL file',
      'Both patterns marked as addressed'
    ],
    test_scenarios: [
      { scenario: 'Infrastructure PRD without system_architecture' },
      { scenario: 'DIGEST file missing but FULL exists' },
      { scenario: 'Both files missing returns BLOCK' }
    ],
    // Missing: system_architecture, implementation_approach, risks
    executive_summary: 'Address two recurring gate validation failures identified through /learn pattern analysis.'
  };
}

describe('PRD Quality Heuristic - SD-Type-Aware Scoring', () => {
  beforeEach(() => {
    // Force heuristic mode
    process.env.PRD_VALIDATION_MODE = 'heuristic';
  });

  describe('Full PRD scores 100 for any SD type', () => {
    it('should score 100 for a feature PRD with all fields', async () => {
      const result = await validatePRDQuality(buildFullPRD(), { sdType: 'feature' });
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('should score 100 for an infrastructure PRD with all fields', async () => {
      const result = await validatePRDQuality(buildFullPRD(), { sdType: 'infrastructure' });
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });
  });

  describe('Infrastructure SDs get reduced penalties', () => {
    it('should deduct only 3 pts per missing optional field for infrastructure', async () => {
      const prd = buildMinimalPRD();
      const result = await validatePRDQuality(prd, { sdType: 'infrastructure' });
      // Missing: system_architecture (-3), implementation_approach (-3), risks (-3) = -9
      // Score: 100 - 9 = 91
      expect(result.score).toBe(91);
      expect(result.passed).toBe(true);
    });

    it('should deduct only 3 pts per missing optional field for fix/bugfix', async () => {
      const prd = buildMinimalPRD();
      const result = await validatePRDQuality(prd, { sdType: 'bugfix' });
      expect(result.score).toBe(91);
      expect(result.passed).toBe(true);
    });

    it('should deduct only 3 pts per missing optional field for documentation', async () => {
      const prd = buildMinimalPRD();
      const result = await validatePRDQuality(prd, { sdType: 'documentation' });
      expect(result.score).toBe(91);
      expect(result.passed).toBe(true);
    });

    it('should deduct only 3 pts per missing optional field for refactor', async () => {
      const prd = buildMinimalPRD();
      const result = await validatePRDQuality(prd, { sdType: 'refactor' });
      expect(result.score).toBe(91);
      expect(result.passed).toBe(true);
    });
  });

  describe('Feature SDs retain standard penalties', () => {
    it('should deduct 5 pts per missing optional field for feature', async () => {
      const prd = buildMinimalPRD();
      const result = await validatePRDQuality(prd, { sdType: 'feature' });
      // Missing: system_architecture (-5), implementation_approach (-5), risks (-5) = -15
      // Score: 100 - 15 = 85
      expect(result.score).toBe(85);
      expect(result.passed).toBe(true);
    });

    it('should deduct 5 pts for unknown/empty SD type', async () => {
      const prd = buildMinimalPRD();
      const result = await validatePRDQuality(prd, { sdType: '' });
      expect(result.score).toBe(85);
    });
  });

  describe('Critical fields always penalize equally', () => {
    it('should still deduct 15 pts for insufficient functional_requirements regardless of SD type', async () => {
      const prd = buildFullPRD();
      prd.functional_requirements = [{ requirement: 'Only one' }];
      const result = await validatePRDQuality(prd, { sdType: 'infrastructure' });
      expect(result.score).toBe(85); // 100 - 15
      expect(result.issues).toHaveLength(1);
      expect(result.passed).toBe(false); // issues.length > 0
    });

    it('should still deduct 15 pts for insufficient acceptance_criteria regardless of SD type', async () => {
      const prd = buildFullPRD();
      prd.acceptance_criteria = ['Only one'];
      const result = await validatePRDQuality(prd, { sdType: 'infrastructure' });
      expect(result.score).toBe(85); // 100 - 15
      expect(result.issues).toHaveLength(1);
      expect(result.passed).toBe(false);
    });
  });

  describe('Details include SD type info', () => {
    it('should include sdType and useReducedPenalty in details', async () => {
      const prd = buildFullPRD();
      const result = await validatePRDQuality(prd, { sdType: 'infrastructure' });
      expect(result.details.sdType).toBe('infrastructure');
      expect(result.details.useReducedPenalty).toBe(true);
    });

    it('should show useReducedPenalty false for feature type', async () => {
      const prd = buildFullPRD();
      const result = await validatePRDQuality(prd, { sdType: 'feature' });
      expect(result.details.useReducedPenalty).toBe(false);
    });
  });
});
