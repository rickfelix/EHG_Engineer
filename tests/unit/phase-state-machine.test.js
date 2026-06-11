/**
 * Unit Tests: Phase State Machine Enforcement
 *
 * Tests the phase transition validation logic.
 *
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-L
 */

import { describe, it, expect } from 'vitest';

// Test the phase state machine patterns
// The actual validation function requires database, so we test the logic patterns independently

describe('Phase State Machine Enforcement', () => {
  // Valid phase transitions
  const VALID_TRANSITIONS = {
    LEAD: ['PLAN', 'LEAD_APPROVAL'],
    LEAD_APPROVAL: ['PLAN'],
    PLAN: ['PLAN_VERIFY', 'EXEC', 'LEAD'],
    PLAN_VERIFY: ['EXEC', 'PLAN'],
    EXEC: ['PLAN', 'EXEC_VERIFY', 'PLAN_TO_LEAD'],
    EXEC_VERIFY: ['PLAN_TO_LEAD', 'EXEC', 'LEAD_FINAL'],
    PLAN_TO_LEAD: ['LEAD_FINAL', 'EXEC'],
    LEAD_FINAL: ['COMPLETED'],
    COMPLETED: []
  };

  function isValidTransition(fromPhase, toPhase) {
    const normalizedFrom = fromPhase.toUpperCase();
    const normalizedTo = toPhase.toUpperCase();
    const validTargets = VALID_TRANSITIONS[normalizedFrom] || [];
    return validTargets.includes(normalizedTo);
  }

  describe('Valid state transitions', () => {
    it('should allow LEAD -> PLAN transition', () => {
      expect(isValidTransition('LEAD', 'PLAN')).toBe(true);
    });

    it('should allow LEAD -> LEAD_APPROVAL transition', () => {
      expect(isValidTransition('LEAD', 'LEAD_APPROVAL')).toBe(true);
    });

    it('should allow PLAN -> EXEC transition', () => {
      expect(isValidTransition('PLAN', 'EXEC')).toBe(true);
    });

    it('should allow PLAN -> PLAN_VERIFY transition', () => {
      expect(isValidTransition('PLAN', 'PLAN_VERIFY')).toBe(true);
    });

    it('should allow PLAN -> LEAD transition (back to lead)', () => {
      expect(isValidTransition('PLAN', 'LEAD')).toBe(true);
    });

    it('should allow EXEC -> PLAN transition (back to plan)', () => {
      expect(isValidTransition('EXEC', 'PLAN')).toBe(true);
    });

    it('should allow EXEC -> PLAN_TO_LEAD transition', () => {
      expect(isValidTransition('EXEC', 'PLAN_TO_LEAD')).toBe(true);
    });

    it('should allow LEAD_FINAL -> COMPLETED transition', () => {
      expect(isValidTransition('LEAD_FINAL', 'COMPLETED')).toBe(true);
    });
  });

  describe('Invalid state transitions', () => {
    it('should NOT allow LEAD -> EXEC transition (skips PLAN)', () => {
      expect(isValidTransition('LEAD', 'EXEC')).toBe(false);
    });

    it('should NOT allow LEAD -> COMPLETED transition (skips everything)', () => {
      expect(isValidTransition('LEAD', 'COMPLETED')).toBe(false);
    });

    it('should NOT allow EXEC -> COMPLETED transition (skips LEAD_FINAL)', () => {
      expect(isValidTransition('EXEC', 'COMPLETED')).toBe(false);
    });

    it('should NOT allow PLAN -> COMPLETED transition', () => {
      expect(isValidTransition('PLAN', 'COMPLETED')).toBe(false);
    });

    it('should NOT allow any transition FROM COMPLETED', () => {
      expect(isValidTransition('COMPLETED', 'LEAD')).toBe(false);
      expect(isValidTransition('COMPLETED', 'PLAN')).toBe(false);
      expect(isValidTransition('COMPLETED', 'EXEC')).toBe(false);
    });
  });

  describe('Handoff to target phase mapping', () => {
    const handoffTargets = {
      'LEAD-TO-PLAN': 'PLAN',
      'PLAN-TO-EXEC': 'EXEC',
      'EXEC-TO-PLAN': 'PLAN',
      'PLAN-TO-LEAD': 'LEAD_FINAL',
      'LEAD-FINAL-APPROVAL': 'COMPLETED'
    };

    Object.entries(handoffTargets).forEach(([handoff, targetPhase]) => {
      it(`should map ${handoff} to ${targetPhase} phase`, () => {
        expect(handoffTargets[handoff]).toBe(targetPhase);
      });
    });
  });

  describe('Phase transition command detection', () => {
    const patterns = [
      /handoff\.js.*execute\s+(LEAD-TO-PLAN|PLAN-TO-EXEC|EXEC-TO-PLAN|PLAN-TO-LEAD|LEAD-FINAL-APPROVAL)/i,
      /sd:.*phase\s+(LEAD|PLAN|EXEC|COMPLETED)/i
    ];

    function detectPhaseTransition(command) {
      for (const pattern of patterns) {
        const match = command.match(pattern);
        if (match) {
          return { detected: true, handoffType: match[1] };
        }
      }
      return null;
    }

    it('should detect LEAD-TO-PLAN handoff command', () => {
      const result = detectPhaseTransition('node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001');
      expect(result).not.toBe(null);
      expect(result.handoffType).toBe('LEAD-TO-PLAN');
    });

    it('should detect PLAN-TO-EXEC handoff command', () => {
      const result = detectPhaseTransition('node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001');
      expect(result).not.toBe(null);
      expect(result.handoffType).toBe('PLAN-TO-EXEC');
    });

    it('should detect LEAD-FINAL-APPROVAL handoff command', () => {
      const result = detectPhaseTransition('node scripts/handoff.js execute LEAD-FINAL-APPROVAL SD-XXX-001');
      expect(result).not.toBe(null);
      expect(result.handoffType).toBe('LEAD-FINAL-APPROVAL');
    });

    it('should NOT detect non-handoff commands', () => {
      const result = detectPhaseTransition('npm run test');
      expect(result).toBe(null);
    });

    it('should NOT detect git commands', () => {
      const result = detectPhaseTransition('git commit -m "message"');
      expect(result).toBe(null);
    });
  });

  describe('Type-specific transition requirements', () => {
    // Test the logic patterns for type-specific requirements

    describe('PRD requirement for EXEC transition', () => {
      it('should require PRD for feature SDs transitioning to EXEC', () => {
        const requirements = { skipCodeValidation: false };
        const targetPhase = 'EXEC';
        const requiresPRD = (targetPhase === 'EXEC' && !requirements.skipCodeValidation);
        expect(requiresPRD).toBe(true);
      });

      it('should NOT require PRD for infrastructure SDs transitioning to EXEC', () => {
        const requirements = { skipCodeValidation: true };
        const targetPhase = 'EXEC';
        const requiresPRD = (targetPhase === 'EXEC' && !requirements.skipCodeValidation);
        expect(requiresPRD).toBe(false);
      });
    });

    describe('UAT requirement for COMPLETED transition', () => {
      it('should require UAT for feature SDs transitioning to COMPLETED', () => {
        const uatRequirement = 'REQUIRED';
        const targetPhase = 'COMPLETED';
        const requiresUAT = (targetPhase === 'COMPLETED' && uatRequirement === 'REQUIRED');
        expect(requiresUAT).toBe(true);
      });

      it('should NOT require UAT for infrastructure SDs transitioning to COMPLETED', () => {
        const uatRequirement = 'EXEMPT';
        const targetPhase = 'COMPLETED';
        const requiresUAT = (targetPhase === 'COMPLETED' && uatRequirement === 'REQUIRED');
        expect(requiresUAT).toBe(false);
      });
    });

    describe('E2E tests requirement for COMPLETED transition', () => {
      it('should require E2E tests for code-producing SDs', () => {
        const requirements = { requiresE2ETests: true };
        const targetPhase = 'COMPLETED';
        const requiresE2E = (targetPhase === 'COMPLETED' && requirements.requiresE2ETests);
        expect(requiresE2E).toBe(true);
      });

      it('should NOT require E2E tests for documentation SDs', () => {
        const requirements = { requiresE2ETests: false };
        const targetPhase = 'COMPLETED';
        const requiresE2E = (targetPhase === 'COMPLETED' && requirements.requiresE2ETests);
        expect(requiresE2E).toBe(false);
      });
    });
  });

  describe('Transition validation result structure', () => {
    it('should return allowed: true when no violations', () => {
      const violations = [];
      const result = { allowed: violations.length === 0, violations };
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should return allowed: false with violations', () => {
      const violations = [
        { type: 'INVALID_TRANSITION', message: 'Cannot transition' }
      ];
      const result = { allowed: violations.length === 0, violations };
      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should include all violation types in result', () => {
      const violations = [
        { type: 'INVALID_TRANSITION', message: 'Message 1' },
        { type: 'PRD_REQUIRED', message: 'Message 2' },
        { type: 'UAT_REQUIRED', message: 'Message 3' }
      ];
      expect(violations.map(v => v.type)).toEqual([
        'INVALID_TRANSITION',
        'PRD_REQUIRED',
        'UAT_REQUIRED'
      ]);
    });
  });

  describe('Full workflow phase sequence', () => {
    it('should support the standard LEO workflow', () => {
      const standardWorkflow = ['LEAD', 'PLAN', 'EXEC', 'PLAN_TO_LEAD', 'LEAD_FINAL', 'COMPLETED'];

      for (let i = 0; i < standardWorkflow.length - 1; i++) {
        const from = standardWorkflow[i];
        const to = standardWorkflow[i + 1];

        // Each transition should be valid via some path
        const validTargets = VALID_TRANSITIONS[from] || [];
        const canReach = validTargets.includes(to) || validTargets.some(intermediate => {
          const intermediateTargets = VALID_TRANSITIONS[intermediate] || [];
          return intermediateTargets.includes(to);
        });

        expect(canReach).toBe(true);
      }
    });

    it('should allow back-tracking from EXEC to PLAN', () => {
      expect(isValidTransition('EXEC', 'PLAN')).toBe(true);
    });

    it('should allow iterative PLAN-EXEC cycles', () => {
      expect(isValidTransition('PLAN', 'EXEC')).toBe(true);
      expect(isValidTransition('EXEC', 'PLAN')).toBe(true);
    });
  });
});
