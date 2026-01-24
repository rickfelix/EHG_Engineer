/**
 * Unit Tests for SD-Type Applicability Policy
 * Part of SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001
 *
 * Tests the centralized policy module that determines which validators
 * are REQUIRED vs NON_APPLICABLE for each SD type.
 */

// Jest test file - uses global describe/it/expect
import {
  POLICY_VERSION,
  RequirementLevel,
  ValidatorStatus,
  SkipReasonCode,
  getValidatorRequirement,
  isValidatorRequired,
  isValidatorNonApplicable,
  getValidatorRequirements,
  getRequiredValidators,
  getNonApplicableValidators,
  createSkippedResult,
  isSkippedResult,
  getPolicySummary
} from '../../scripts/modules/handoff/validation/sd-type-applicability-policy.js';

describe('SD-Type Applicability Policy', () => {
  describe('Policy Version', () => {
    it('should have a policy version defined', () => {
      expect(POLICY_VERSION).toBeDefined();
      expect(typeof POLICY_VERSION).toBe('string');
      expect(POLICY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Enums', () => {
    it('should define RequirementLevel correctly', () => {
      expect(RequirementLevel.REQUIRED).toBe('REQUIRED');
      expect(RequirementLevel.NON_APPLICABLE).toBe('NON_APPLICABLE');
      expect(RequirementLevel.OPTIONAL).toBe('OPTIONAL');
    });

    it('should define ValidatorStatus correctly', () => {
      expect(ValidatorStatus.PASS).toBe('PASS');
      expect(ValidatorStatus.FAIL).toBe('FAIL');
      expect(ValidatorStatus.SKIPPED).toBe('SKIPPED');
      expect(ValidatorStatus.NOT_RUN).toBe('NOT_RUN');
    });

    it('should define SkipReasonCode correctly', () => {
      expect(SkipReasonCode.NON_APPLICABLE_SD_TYPE).toBe('NON_APPLICABLE_SD_TYPE');
    });
  });

  describe('getValidatorRequirement()', () => {
    it('should return REQUIRED for unknown SD types (safe default)', () => {
      const result = getValidatorRequirement('unknown_type', 'TESTING');
      expect(result).toBe(RequirementLevel.REQUIRED);
    });

    it('should handle null/undefined SD type', () => {
      expect(getValidatorRequirement(null, 'TESTING')).toBe(RequirementLevel.REQUIRED);
      expect(getValidatorRequirement(undefined, 'TESTING')).toBe(RequirementLevel.REQUIRED);
    });

    // Refactor SD type - PRIMARY FIX
    describe('refactor SD type', () => {
      it('should mark TESTING as NON_APPLICABLE for refactor', () => {
        expect(getValidatorRequirement('refactor', 'TESTING')).toBe(RequirementLevel.NON_APPLICABLE);
      });

      it('should mark DESIGN as NON_APPLICABLE for refactor', () => {
        expect(getValidatorRequirement('refactor', 'DESIGN')).toBe(RequirementLevel.NON_APPLICABLE);
      });

      it('should mark REGRESSION as REQUIRED for refactor', () => {
        expect(getValidatorRequirement('refactor', 'REGRESSION')).toBe(RequirementLevel.REQUIRED);
      });

      it('should mark GITHUB as REQUIRED for refactor', () => {
        expect(getValidatorRequirement('refactor', 'GITHUB')).toBe(RequirementLevel.REQUIRED);
      });
    });

    // Infrastructure SD type
    describe('infrastructure SD type', () => {
      it('should mark TESTING as NON_APPLICABLE for infrastructure', () => {
        expect(getValidatorRequirement('infrastructure', 'TESTING')).toBe(RequirementLevel.NON_APPLICABLE);
      });

      it('should mark DESIGN as NON_APPLICABLE for infrastructure', () => {
        expect(getValidatorRequirement('infrastructure', 'DESIGN')).toBe(RequirementLevel.NON_APPLICABLE);
      });

      it('should mark GITHUB as NON_APPLICABLE for infrastructure', () => {
        expect(getValidatorRequirement('infrastructure', 'GITHUB')).toBe(RequirementLevel.NON_APPLICABLE);
      });

      it('should mark DOCMON as REQUIRED for infrastructure', () => {
        expect(getValidatorRequirement('infrastructure', 'DOCMON')).toBe(RequirementLevel.REQUIRED);
      });
    });

    // Feature SD type (full validation)
    describe('feature SD type', () => {
      it('should mark TESTING as REQUIRED for feature', () => {
        expect(getValidatorRequirement('feature', 'TESTING')).toBe(RequirementLevel.REQUIRED);
      });

      it('should mark DESIGN as REQUIRED for feature', () => {
        expect(getValidatorRequirement('feature', 'DESIGN')).toBe(RequirementLevel.REQUIRED);
      });

      it('should mark STORIES as REQUIRED for feature', () => {
        expect(getValidatorRequirement('feature', 'STORIES')).toBe(RequirementLevel.REQUIRED);
      });
    });
  });

  describe('isValidatorRequired()', () => {
    it('should return true for REQUIRED validators', () => {
      expect(isValidatorRequired('refactor', 'REGRESSION')).toBe(true);
      expect(isValidatorRequired('feature', 'TESTING')).toBe(true);
    });

    it('should return false for NON_APPLICABLE validators', () => {
      expect(isValidatorRequired('refactor', 'TESTING')).toBe(false);
      expect(isValidatorRequired('infrastructure', 'DESIGN')).toBe(false);
    });

    it('should return false for OPTIONAL validators', () => {
      expect(isValidatorRequired('refactor', 'DOCMON')).toBe(false);
    });
  });

  describe('isValidatorNonApplicable()', () => {
    it('should return true for NON_APPLICABLE validators', () => {
      expect(isValidatorNonApplicable('refactor', 'TESTING')).toBe(true);
      expect(isValidatorNonApplicable('documentation', 'GITHUB')).toBe(true);
    });

    it('should return false for REQUIRED validators', () => {
      expect(isValidatorNonApplicable('refactor', 'REGRESSION')).toBe(false);
      expect(isValidatorNonApplicable('feature', 'TESTING')).toBe(false);
    });
  });

  describe('getRequiredValidators()', () => {
    it('should return only REQUIRED validators for refactor', () => {
      const required = getRequiredValidators('refactor');
      expect(required).toContain('REGRESSION');
      expect(required).toContain('GITHUB');
      expect(required).not.toContain('TESTING');
      expect(required).not.toContain('DESIGN');
    });

    it('should return multiple REQUIRED validators for feature', () => {
      const required = getRequiredValidators('feature');
      expect(required).toContain('TESTING');
      expect(required).toContain('DESIGN');
      expect(required).toContain('DOCMON');
      expect(required).toContain('STORIES');
    });

    it('should return empty array for unknown SD type', () => {
      const required = getRequiredValidators('unknown_type');
      expect(required).toEqual([]);
    });
  });

  describe('getNonApplicableValidators()', () => {
    it('should return NON_APPLICABLE validators for refactor', () => {
      const nonApplicable = getNonApplicableValidators('refactor');
      expect(nonApplicable).toContain('TESTING');
      expect(nonApplicable).toContain('DESIGN');
      expect(nonApplicable).toContain('DATABASE');
      expect(nonApplicable).toContain('STORIES');
      expect(nonApplicable).not.toContain('REGRESSION');
    });

    it('should return many NON_APPLICABLE validators for documentation', () => {
      const nonApplicable = getNonApplicableValidators('documentation');
      expect(nonApplicable).toContain('TESTING');
      expect(nonApplicable).toContain('DESIGN');
      expect(nonApplicable).toContain('GITHUB');
      expect(nonApplicable).toContain('DATABASE');
      expect(nonApplicable).toContain('REGRESSION');
    });
  });

  describe('createSkippedResult()', () => {
    it('should create a properly structured SKIPPED result', () => {
      const result = createSkippedResult('TESTING', 'refactor');

      expect(result.passed).toBe(true);
      expect(result.status).toBe(ValidatorStatus.SKIPPED);
      expect(result.score).toBe(100);
      expect(result.max_score).toBe(100);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe(SkipReasonCode.NON_APPLICABLE_SD_TYPE);
      expect(result.issues).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should include skip details for traceability', () => {
      const result = createSkippedResult('DESIGN', 'infrastructure', SkipReasonCode.NON_APPLICABLE_SD_TYPE);

      expect(result.skipDetails).toBeDefined();
      expect(result.skipDetails.validator_name).toBe('DESIGN');
      expect(result.skipDetails.sd_type).toBe('infrastructure');
      expect(result.skipDetails.reason_code).toBe(SkipReasonCode.NON_APPLICABLE_SD_TYPE);
      expect(result.skipDetails.policy_version).toBe(POLICY_VERSION);
      expect(result.skipDetails.timestamp).toBeDefined();
    });

    it('should accept custom reason codes', () => {
      const result = createSkippedResult('TESTING', 'refactor', SkipReasonCode.DISABLED_BY_CONFIG);
      expect(result.skipReason).toBe(SkipReasonCode.DISABLED_BY_CONFIG);
    });
  });

  describe('isSkippedResult()', () => {
    it('should return true for SKIPPED status', () => {
      const result = { status: ValidatorStatus.SKIPPED };
      expect(isSkippedResult(result)).toBe(true);
    });

    it('should return true for skipped=true flag', () => {
      const result = { skipped: true };
      expect(isSkippedResult(result)).toBe(true);
    });

    it('should return true for skipReason present', () => {
      const result = { skipReason: SkipReasonCode.NON_APPLICABLE_SD_TYPE };
      expect(isSkippedResult(result)).toBe(true);
    });

    it('should return true for createSkippedResult() output', () => {
      const result = createSkippedResult('TESTING', 'refactor');
      expect(isSkippedResult(result)).toBe(true);
    });

    it('should return false for PASS result', () => {
      const result = { passed: true, status: ValidatorStatus.PASS };
      expect(isSkippedResult(result)).toBe(false);
    });

    it('should return false for FAIL result', () => {
      const result = { passed: false, status: ValidatorStatus.FAIL };
      expect(isSkippedResult(result)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isSkippedResult(null)).toBe(false);
      expect(isSkippedResult(undefined)).toBe(false);
    });
  });

  describe('getPolicySummary()', () => {
    it('should return a complete summary for refactor', () => {
      const summary = getPolicySummary('refactor');

      expect(summary.sd_type).toBe('refactor');
      expect(summary.policy_version).toBe(POLICY_VERSION);
      expect(Array.isArray(summary.required)).toBe(true);
      expect(Array.isArray(summary.non_applicable)).toBe(true);
      expect(Array.isArray(summary.optional)).toBe(true);
      expect(typeof summary.total_validators).toBe('number');
    });

    it('should correctly categorize validators for refactor', () => {
      const summary = getPolicySummary('refactor');

      expect(summary.required).toContain('REGRESSION');
      expect(summary.required).toContain('GITHUB');
      expect(summary.non_applicable).toContain('TESTING');
      expect(summary.non_applicable).toContain('DESIGN');
    });
  });

  describe('Integration: Refactor SD Workflow', () => {
    it('should allow refactor SD to complete with REGRESSION only', () => {
      const sdType = 'refactor';
      const required = getRequiredValidators(sdType);
      const nonApplicable = getNonApplicableValidators(sdType);

      // Verify REGRESSION is the primary required validator
      expect(required).toContain('REGRESSION');

      // Verify TESTING and DESIGN are skippable
      expect(nonApplicable).toContain('TESTING');
      expect(nonApplicable).toContain('DESIGN');

      // Simulate validation results
      const validationResults = {
        REGRESSION: { passed: true, status: ValidatorStatus.PASS },
        GITHUB: { passed: true, status: ValidatorStatus.PASS },
        TESTING: createSkippedResult('TESTING', sdType),
        DESIGN: createSkippedResult('DESIGN', sdType)
      };

      // All results should be acceptable
      for (const [validator, result] of Object.entries(validationResults)) {
        const isNonApplicable = isValidatorNonApplicable(sdType, validator);

        if (isNonApplicable) {
          // Non-applicable validators should be SKIPPED
          expect(isSkippedResult(result)).toBe(true);
          expect(result.passed).toBe(true); // SKIPPED counts as passing
        } else {
          // Required validators should PASS
          expect(result.passed).toBe(true);
        }
      }
    });
  });
});
