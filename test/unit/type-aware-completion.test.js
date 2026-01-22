/**
 * Unit Tests: Type-Aware SD Completion Validation
 *
 * Tests the type-specific completion validation logic.
 *
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-H
 */

import { describe, it, expect } from 'vitest';

// Test the sd-type-validation module functions
import {
  getValidationRequirements,
  getUATRequirement
} from '../../lib/utils/sd-type-validation.js';

describe('Type-Aware SD Completion Validation', () => {
  describe('getUATRequirement', () => {
    it('should return REQUIRED for feature SDs', () => {
      expect(getUATRequirement('feature')).toBe('REQUIRED');
    });

    it('should return REQUIRED for bugfix SDs', () => {
      expect(getUATRequirement('bugfix')).toBe('REQUIRED');
    });

    it('should return REQUIRED for security SDs', () => {
      expect(getUATRequirement('security')).toBe('REQUIRED');
    });

    it('should return REQUIRED for refactor SDs', () => {
      expect(getUATRequirement('refactor')).toBe('REQUIRED');
    });

    it('should return REQUIRED for enhancement SDs', () => {
      expect(getUATRequirement('enhancement')).toBe('REQUIRED');
    });

    it('should return PROMPT for performance SDs', () => {
      expect(getUATRequirement('performance')).toBe('PROMPT');
    });

    it('should return EXEMPT for infrastructure SDs', () => {
      expect(getUATRequirement('infrastructure')).toBe('EXEMPT');
    });

    it('should return EXEMPT for database SDs', () => {
      expect(getUATRequirement('database')).toBe('EXEMPT');
    });

    it('should return EXEMPT for documentation SDs', () => {
      expect(getUATRequirement('documentation')).toBe('EXEMPT');
    });

    it('should return EXEMPT for orchestrator SDs', () => {
      expect(getUATRequirement('orchestrator')).toBe('EXEMPT');
    });

    it('should return PROMPT for unknown types', () => {
      expect(getUATRequirement('unknown-type')).toBe('PROMPT');
    });

    it('should handle case insensitivity', () => {
      expect(getUATRequirement('FEATURE')).toBe('REQUIRED');
      expect(getUATRequirement('Feature')).toBe('REQUIRED');
    });

    it('should handle null/undefined', () => {
      expect(getUATRequirement(null)).toBe('REQUIRED'); // defaults to feature
      expect(getUATRequirement(undefined)).toBe('REQUIRED');
    });
  });

  describe('getValidationRequirements', () => {
    describe('Feature SDs', () => {
      it('should require UAT execution', () => {
        const sd = { sd_type: 'feature', title: 'Test Feature' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresUATExecution).toBe(true);
      });

      it('should require human verifiable outcome', () => {
        const sd = { sd_type: 'feature', title: 'Test Feature' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresHumanVerifiableOutcome).toBe(true);
        expect(reqs.humanVerificationType).toBe('ui_smoke_test');
      });

      it('should require E2E tests', () => {
        const sd = { sd_type: 'feature', title: 'Test Feature' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresE2ETests).toBe(true);
      });

      it('should require LLM UX validation', () => {
        const sd = { sd_type: 'feature', title: 'Test Feature' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresLLMUXValidation).toBe(true);
        expect(reqs.llmUxMinScore).toBe(50);
      });
    });

    describe('Bugfix SDs', () => {
      it('should require UAT execution', () => {
        const sd = { sd_type: 'bugfix', title: 'Fix Bug' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresUATExecution).toBe(true);
      });

      it('should require human verifiable outcome', () => {
        const sd = { sd_type: 'bugfix', title: 'Fix Bug' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresHumanVerifiableOutcome).toBe(true);
        expect(reqs.humanVerificationType).toBe('ui_smoke_test');
      });

      it('should NOT require LLM UX validation', () => {
        const sd = { sd_type: 'bugfix', title: 'Fix Bug' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresLLMUXValidation).toBe(false);
      });
    });

    describe('Infrastructure SDs', () => {
      it('should NOT require UAT execution', () => {
        const sd = { sd_type: 'infrastructure', title: 'Infra Work' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresUATExecution).toBe(false);
      });

      it('should NOT require human verifiable outcome', () => {
        const sd = { sd_type: 'infrastructure', title: 'Infra Work' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresHumanVerifiableOutcome).toBe(false);
      });

      it('should skip code validation', () => {
        const sd = { sd_type: 'infrastructure', title: 'Infra Work' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.skipCodeValidation).toBe(true);
      });
    });

    describe('Documentation SDs', () => {
      it('should NOT require any human verification', () => {
        const sd = { sd_type: 'documentation', title: 'Docs Update' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresUATExecution).toBe(false);
        expect(reqs.requiresHumanVerifiableOutcome).toBe(false);
        expect(reqs.humanVerificationType).toBe('none');
      });

      it('should skip code validation', () => {
        const sd = { sd_type: 'documentation', title: 'Docs Update' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.skipCodeValidation).toBe(true);
        expect(reqs.requiresTesting).toBe(false);
        expect(reqs.requiresE2ETests).toBe(false);
      });
    });

    describe('Orchestrator SDs', () => {
      it('should have minimal requirements', () => {
        const sd = { sd_type: 'orchestrator', title: 'Orchestrator' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresUATExecution).toBe(false);
        expect(reqs.requiresHumanVerifiableOutcome).toBe(false);
        expect(reqs.requiresLLMUXValidation).toBe(false);
      });
    });

    describe('Security SDs', () => {
      it('should require UAT and human verification', () => {
        const sd = { sd_type: 'security', title: 'Security Fix' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresUATExecution).toBe(true);
        expect(reqs.requiresHumanVerifiableOutcome).toBe(true);
        expect(reqs.humanVerificationType).toBe('api_test');
      });
    });

    describe('Enhancement SDs', () => {
      it('should require UAT (LEO v4.4.1)', () => {
        const sd = { sd_type: 'enhancement', title: 'Enhancement' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresUATExecution).toBe(true);
      });
    });

    describe('Refactor SDs', () => {
      it('should require UAT for regression testing (LEO v4.4.1)', () => {
        const sd = { sd_type: 'refactor', title: 'Refactor' };
        const reqs = getValidationRequirements(sd);
        expect(reqs.requiresUATExecution).toBe(true);
      });
    });
  });

  describe('Integration scenarios', () => {
    it('UAT requirement should align with validation requirements for feature SDs', () => {
      const sd = { sd_type: 'feature', title: 'Feature' };
      const uatReq = getUATRequirement('feature');
      const validationReqs = getValidationRequirements(sd);

      // Both should indicate UAT is required
      expect(uatReq).toBe('REQUIRED');
      expect(validationReqs.requiresUATExecution).toBe(true);
    });

    it('UAT requirement should align with validation requirements for infrastructure SDs', () => {
      const sd = { sd_type: 'infrastructure', title: 'Infra' };
      const uatReq = getUATRequirement('infrastructure');
      const validationReqs = getValidationRequirements(sd);

      // Both should indicate UAT is NOT required
      expect(uatReq).toBe('EXEMPT');
      expect(validationReqs.requiresUATExecution).toBe(false);
    });

    it('should handle SD with scope containing UI keywords', () => {
      const sd = { sd_type: 'feature', title: 'Feature', scope: 'Add new dashboard component' };
      const reqs = getValidationRequirements(sd);

      expect(reqs.hasUIComponents).toBe(true);
      expect(reqs.requiresDesign).toBe(true);
    });
  });
});
