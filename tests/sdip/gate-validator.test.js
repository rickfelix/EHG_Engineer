/**
 * Unit Tests for SDIP Gate Validators
 * Implements Testing Sub-Agent requirements
 * Created: 2025-01-03
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import ValidationGateEnforcer from '../../lib/dashboard/sdip/validators/gate-enforcer.js';

describe('SDIP Gate Validation Tests', () => {
  let enforcer;
  let mockSubmission;

  beforeEach(() => {
    enforcer = new ValidationGateEnforcer();
    mockSubmission = {
      chairman_input: '',
      intent_summary: '',
      intent_confirmed: false,
      strat_tac_reviewed: false,
      strat_tac_final: null,
      synthesis_reviewed: false,
      synthesis: null,
      questions_answered: false,
      clarifying_questions: null,
      summary_confirmed: false,
      client_summary: ''
    };
  });

  describe('Gate 1: Input Validation', () => {
    it('should pass with valid input', () => {
      mockSubmission.chairman_input = 'The dashboard is too slow when loading large datasets';
      const result = enforcer.validateGate(1, mockSubmission);
      expect(result.passed).toBe(true);
    });

    it('should fail with empty input', () => {
      mockSubmission.chairman_input = '';
      const result = enforcer.validateGate(1, mockSubmission);
      expect(result.passed).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should fail with whitespace-only input', () => {
      mockSubmission.chairman_input = '   \n\t   ';
      const result = enforcer.validateGate(1, mockSubmission);
      expect(result.passed).toBe(false);
    });

    it('should handle special characters', () => {
      mockSubmission.chairman_input = '<script>alert("xss")</script>';
      const result = enforcer.validateGate(1, mockSubmission);
      expect(result.passed).toBe(true); // Validation passes, sanitization happens elsewhere
    });
  });

  describe('Gate 2: Intent Confirmation', () => {
    it('should pass with confirmed intent', () => {
      mockSubmission.intent_confirmed = true;
      mockSubmission.intent_summary = 'Improve dashboard performance';
      const result = enforcer.validateGate(2, mockSubmission);
      expect(result.passed).toBe(true);
    });

    it('should fail without confirmation', () => {
      mockSubmission.intent_confirmed = false;
      mockSubmission.intent_summary = 'Improve dashboard performance';
      const result = enforcer.validateGate(2, mockSubmission);
      expect(result.passed).toBe(false);
    });

    it('should fail with empty intent summary', () => {
      mockSubmission.intent_confirmed = true;
      mockSubmission.intent_summary = '';
      const result = enforcer.validateGate(2, mockSubmission);
      expect(result.passed).toBe(false);
    });

    it('should handle very long intent summaries', () => {
      mockSubmission.intent_confirmed = true;
      mockSubmission.intent_summary = 'x'.repeat(1000);
      const result = enforcer.validateGate(2, mockSubmission);
      expect(result.passed).toBe(true);
    });
  });

  describe('Gate 3: Classification Review', () => {
    it('should pass with reviewed classification', () => {
      mockSubmission.strat_tac_reviewed = true;
      mockSubmission.strat_tac_final = { strategic: true, tactical: false };
      const result = enforcer.validateGate(3, mockSubmission);
      expect(result.passed).toBe(true);
    });

    it('should fail without review', () => {
      mockSubmission.strat_tac_reviewed = false;
      const result = enforcer.validateGate(3, mockSubmission);
      expect(result.passed).toBe(false);
    });

    it('should fail with null classification', () => {
      mockSubmission.strat_tac_reviewed = true;
      mockSubmission.strat_tac_final = null;
      const result = enforcer.validateGate(3, mockSubmission);
      expect(result.passed).toBe(false);
    });
  });

  describe('Gate Sequence Enforcement', () => {
    it('should prevent skipping gates', () => {
      const result = enforcer.canTransitionToGate(1, 3, mockSubmission);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('skip');
    });

    it('should allow sequential progression', () => {
      mockSubmission.chairman_input = 'Valid input';
      const result = enforcer.canTransitionToGate(1, 2, mockSubmission);
      expect(result.allowed).toBe(true);
    });

    it('should prevent backward movement', () => {
      const result = enforcer.canTransitionToGate(4, 2, mockSubmission);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('backward');
    });

    it('should track gate completion status', () => {
      mockSubmission.chairman_input = 'Valid input';
      mockSubmission.intent_confirmed = true;
      mockSubmission.intent_summary = 'Summary';
      
      const status = enforcer.getGateStatus(mockSubmission);
      expect(status[1].completed).toBe(true);
      expect(status[2].completed).toBe(true);
      expect(status[3].completed).toBe(false);
    });
  });

  describe('Complete Flow Validation', () => {
    it('should validate complete 6-gate flow', () => {
      // Gate 1
      mockSubmission.chairman_input = 'Dashboard performance issue';
      expect(enforcer.validateGate(1, mockSubmission).passed).toBe(true);

      // Gate 2
      mockSubmission.intent_summary = 'Improve dashboard performance';
      mockSubmission.intent_confirmed = true;
      expect(enforcer.validateGate(2, mockSubmission).passed).toBe(true);

      // Gate 3
      mockSubmission.strat_tac_final = { strategic: false, tactical: true };
      mockSubmission.strat_tac_reviewed = true;
      expect(enforcer.validateGate(3, mockSubmission).passed).toBe(true);

      // Gate 4
      mockSubmission.synthesis = { aligned: [], required: [], recommended: [] };
      mockSubmission.synthesis_reviewed = true;
      expect(enforcer.validateGate(4, mockSubmission).passed).toBe(true);

      // Gate 5
      mockSubmission.clarifying_questions = ['Q1', 'Q2'];
      mockSubmission.question_answers = ['A1', 'A2'];
      mockSubmission.questions_answered = true;
      expect(enforcer.validateGate(5, mockSubmission).passed).toBe(true);

      // Gate 6
      mockSubmission.client_summary = 'Final summary of changes';
      mockSubmission.summary_confirmed = true;
      expect(enforcer.validateGate(6, mockSubmission).passed).toBe(true);

      // All gates passed
      expect(enforcer.areAllGatesPassed(mockSubmission)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing submission data', () => {
      const result = enforcer.validateGate(1, null);
      expect(result.passed).toBe(false);
      expect(result.error).toContain('Invalid submission');
    });

    it('should handle invalid gate numbers', () => {
      const result = enforcer.validateGate(7, mockSubmission);
      expect(result.passed).toBe(false);
      expect(result.error).toContain('Invalid gate');
    });

    it('should handle malformed data gracefully', () => {
      mockSubmission.strat_tac_final = 'not an object';
      const result = enforcer.validateGate(3, mockSubmission);
      expect(result.passed).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should validate gates quickly', () => {
      mockSubmission.chairman_input = 'Test input';
      const start = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        enforcer.validateGate(1, mockSubmission);
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should complete 1000 validations in <100ms
    });
  });
});

describe('Security Validation', () => {
  let enforcer;

  beforeEach(() => {
    enforcer = new ValidationGateEnforcer();
  });

  it('should prevent prototype pollution', () => {
    const maliciousSubmission = {
      '__proto__': { isAdmin: true },
      chairman_input: 'test'
    };
    
    const result = enforcer.validateGate(1, maliciousSubmission);
    expect(result.passed).toBe(true); // Input is valid
    expect(enforcer.isAdmin).toBeUndefined(); // Prototype not polluted
  });

  it('should handle SQL injection attempts safely', () => {
    const submission = {
      chairman_input: "'; DROP TABLE users; --",
      intent_summary: "SELECT * FROM users WHERE 1=1"
    };
    
    // Validation should pass (sanitization happens elsewhere)
    const result = enforcer.validateGate(1, submission);
    expect(result.passed).toBe(true);
  });

  it('should handle XSS attempts', () => {
    const submission = {
      chairman_input: '<img src=x onerror=alert(1)>',
      intent_summary: 'javascript:alert(document.cookie)'
    };
    
    const result = enforcer.validateGate(1, submission);
    expect(result.passed).toBe(true); // Validation passes, sanitization in separate layer
  });
});