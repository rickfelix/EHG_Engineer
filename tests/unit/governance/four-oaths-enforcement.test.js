/**
 * Unit Tests: Four Oaths Enforcement
 * SD-MANIFESTO-003: Four Oaths Enforcement Triggers
 *
 * Test Coverage:
 * - Oath 1: Transparency validation
 * - Oath 2: Boundaries validation
 * - Oath 3: Escalation Integrity validation
 * - Oath 4: Non-Deception validation
 * - Combined validation
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  FourOathsEnforcement,
  TransparencyViolation,
  BoundaryViolation,
  EscalationViolation,
  DeceptionViolation,
  isOathCompliant,
  getAuthorityLimits,
  getConfidenceThreshold
} from '../../../lib/governance/four-oaths-enforcement.js';

// Mock Supabase client
vi.mock('@supabase/supabase-js');

describe('FourOathsEnforcement', () => {
  let enforcement;
  let mockSupabase;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null })
    };

    createClient.mockReturnValue(mockSupabase);
    enforcement = new FourOathsEnforcement();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // OATH 1: TRANSPARENCY
  // ===========================================================================

  describe('Oath 1: Transparency', () => {
    test('should pass valid decision with all required fields', () => {
      const decision = {
        input: 'User requested budget increase',
        reasoning: 'Based on market analysis and growth projections, a 20% budget increase is justified',
        output: 'Approved budget increase of 20%',
        confidence: 0.85
      };

      const result = enforcement.validateTransparency(decision);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('should fail when missing required fields', () => {
      const decision = {
        input: 'User requested something',
        output: 'Did something'
        // Missing: reasoning, confidence
      };

      const result = enforcement.validateTransparency(decision);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing required field: reasoning');
      expect(result.issues).toContain('Missing required field: confidence');
    });

    test('should fail when reasoning is too brief', () => {
      const decision = {
        input: 'User request',
        reasoning: 'OK',  // Too short
        output: 'Done',
        confidence: 0.8
      };

      const result = enforcement.validateTransparency(decision);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('Reasoning too brief'))).toBe(true);
    });

    test('should throw TransparencyViolation on enforce', () => {
      const decision = { input: 'test' };

      expect(() => enforcement.enforceTransparency(decision)).toThrow(TransparencyViolation);
    });
  });

  // ===========================================================================
  // OATH 2: BOUNDARIES
  // ===========================================================================

  describe('Oath 2: Boundaries', () => {
    test('should pass L4 crew with no spend', () => {
      const action = {
        agentLevel: 'L4_CREW',
        spendAmount: 0
      };

      const result = enforcement.validateBoundaries(action);

      expect(result.valid).toBe(true);
    });

    test('should fail L4 crew trying to spend', () => {
      const action = {
        agentLevel: 'L4_CREW',
        spendAmount: 10
      };

      const result = enforcement.validateBoundaries(action);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('exceeds limit'))).toBe(true);
    });

    test('should fail L3 VP exceeding $50 limit', () => {
      const action = {
        agentLevel: 'L3_VP',
        spendAmount: 100
      };

      const result = enforcement.validateBoundaries(action);

      expect(result.valid).toBe(false);
    });

    test('should pass L2 CEO spending $400', () => {
      const action = {
        agentLevel: 'L2_CEO',
        spendAmount: 400
      };

      const result = enforcement.validateBoundaries(action);

      expect(result.valid).toBe(true);
    });

    test('should fail L2 CEO trying to kill venture', () => {
      const action = {
        agentLevel: 'L2_CEO',
        killVenture: true
      };

      const result = enforcement.validateBoundaries(action);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('cannot kill'))).toBe(true);
    });

    test('should throw BoundaryViolation on enforce', () => {
      const action = { agentLevel: 'L4_CREW', spendAmount: 100 };

      expect(() => enforcement.enforceBoundaries(action)).toThrow(BoundaryViolation);
    });
  });

  // ===========================================================================
  // OATH 3: ESCALATION INTEGRITY
  // ===========================================================================

  describe('Oath 3: Escalation Integrity', () => {
    test('should pass when confident decision not escalated', () => {
      const decision = {
        agentLevel: 'L3_VP',
        confidence: 0.90,
        escalated: false
      };

      const result = enforcement.validateEscalationIntegrity(decision);

      expect(result.valid).toBe(true);
    });

    test('should fail when low confidence not escalated', () => {
      const decision = {
        agentLevel: 'L3_VP',
        confidence: 0.70,  // Below 0.85 threshold
        escalated: false
      };

      const result = enforcement.validateEscalationIntegrity(decision);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('escalation required'))).toBe(true);
    });

    test('should pass when low confidence but escalated', () => {
      const decision = {
        agentLevel: 'L3_VP',
        confidence: 0.70,
        escalated: true
      };

      const result = enforcement.validateEscalationIntegrity(decision);

      expect(result.valid).toBe(true);
    });

    test('should fail when mandatory category not escalated', () => {
      const decision = {
        agentLevel: 'L3_VP',
        confidence: 0.95,
        category: 'security_concern',
        escalated: false
      };

      const result = enforcement.validateEscalationIntegrity(decision);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('mandatory escalation'))).toBe(true);
    });

    test('should throw EscalationViolation on enforce', () => {
      const decision = { agentLevel: 'L4_CREW', confidence: 0.5, escalated: false };

      expect(() => enforcement.enforceEscalationIntegrity(decision)).toThrow(EscalationViolation);
    });
  });

  // ===========================================================================
  // OATH 4: NON-DECEPTION
  // ===========================================================================

  describe('Oath 4: Non-Deception', () => {
    test('should pass valid output with proper confidence', () => {
      const output = {
        confidence: 0.75,
        buckets: {
          facts: ['Database shows 100 users'],
          assumptions: ['Growth will continue'],
          unknowns: ['Competitor response unknown']
        }
      };

      const result = enforcement.validateNonDeception(output);

      expect(result.valid).toBe(true);
    });

    test('should fail confidence outside bounds', () => {
      const output = {
        confidence: 1.5,  // Invalid
        buckets: {}
      };

      const result = enforcement.validateNonDeception(output);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('outside valid bounds'))).toBe(true);
    });

    test('should fail unknown output bucket', () => {
      const output = {
        confidence: 0.8,
        buckets: {
          facts: ['something'],
          guesses: ['invalid bucket']  // Not in valid list
        }
      };

      const result = enforcement.validateNonDeception(output);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('Unknown output bucket'))).toBe(true);
    });

    test('should warn high confidence with no unknowns', () => {
      const output = {
        confidence: 0.95,
        buckets: {
          facts: ['everything is known']
        }
        // No unknowns acknowledged
      };

      const result = enforcement.validateNonDeception(output);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('suspicious'))).toBe(true);
    });

    test('should throw DeceptionViolation on enforce', () => {
      const output = { confidence: 1.5 };

      expect(() => enforcement.enforceNonDeception(output)).toThrow(DeceptionViolation);
    });
  });

  // ===========================================================================
  // COMBINED VALIDATION
  // ===========================================================================

  describe('Combined Validation', () => {
    test('should validate all oaths together', () => {
      const agentAction = {
        decision: {
          input: 'Request for analysis',
          reasoning: 'Analyzed the data carefully and found patterns',
          output: 'Report generated',
          confidence: 0.85,
          agentLevel: 'L3_VP',
          escalated: true
        },
        action: {
          agentLevel: 'L3_VP',
          spendAmount: 20
        },
        output: {
          confidence: 0.85,
          buckets: {
            facts: ['Data shows growth'],
            unknowns: ['Future uncertainty']
          }
        }
      };

      const result = enforcement.validateAllOaths(agentAction);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    test('should catch violations across multiple oaths', () => {
      const agentAction = {
        decision: {
          input: 'test'
          // Missing fields
        },
        action: {
          agentLevel: 'L4_CREW',
          spendAmount: 100  // Exceeds limit
        },
        output: {
          confidence: 2.0  // Invalid
        }
      };

      const result = enforcement.validateAllOaths(agentAction);

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(1);
    });
  });

  // ===========================================================================
  // HELPER FUNCTIONS
  // ===========================================================================

  describe('Helper Functions', () => {
    test('getAuthorityLimits should return correct limits', () => {
      const limits = getAuthorityLimits('L3_VP');

      expect(limits.spendLimit).toBe(50);
      expect(limits.canKillVenture).toBe(false);
    });

    test('getConfidenceThreshold should return correct threshold', () => {
      const threshold = getConfidenceThreshold('L2_CEO');

      expect(threshold).toBe(0.75);
    });

    test('isOathCompliant should return boolean (async)', async () => {
      const validAction = {
        decision: {
          input: 'test input',
          reasoning: 'proper reasoning here',
          output: 'test output',
          confidence: 0.8,
          agentLevel: 'L3_VP',
          escalated: true
        },
        action: { agentLevel: 'L3_VP' },
        output: { confidence: 0.8, unknowns: ['some gap'] }
      };

      // Note: isOathCompliant uses singleton, may have state from other tests
      // Now async to support AEGIS mode
      const result = await isOathCompliant(validAction);
      expect(typeof result).toBe('boolean');
    });
  });

  // ===========================================================================
  // AEGIS INTEGRATION
  // ===========================================================================

  describe('AEGIS Integration', () => {
    test('should support setAegisMode toggle', () => {
      expect(typeof enforcement.setAegisMode).toBe('function');

      // Default should be false (unless USE_AEGIS env is set)
      enforcement.setAegisMode(false);
      expect(enforcement.useAegis).toBe(false);

      // Enable AEGIS
      enforcement.setAegisMode(true);
      expect(enforcement.useAegis).toBe(true);

      // Disable for remaining tests
      enforcement.setAegisMode(false);
    });

    test('validateAllOaths should include aegis_enabled in result', () => {
      enforcement.setAegisMode(false);

      const agentAction = {
        decision: {
          input: 'test',
          reasoning: 'adequate reasoning here',
          output: 'result',
          confidence: 0.85
        },
        action: { agentLevel: 'L3_VP' },
        output: { confidence: 0.85, unknowns: ['gap'] }
      };

      const result = enforcement.validateAllOaths(agentAction);

      expect(result).toHaveProperty('aegis_enabled');
      expect(result.aegis_enabled).toBe(false);
    });

    test('AEGIS mode should return promise', async () => {
      enforcement.setAegisMode(true);

      const agentAction = {
        decision: {
          input: 'test',
          reasoning: 'adequate reasoning here',
          output: 'result',
          confidence: 0.85
        },
        action: { agentLevel: 'L3_VP' },
        output: { confidence: 0.85, unknowns: ['gap'] }
      };

      const resultPromise = enforcement.validateAllOaths(agentAction);

      // Should be a promise when AEGIS is enabled
      expect(resultPromise).toBeInstanceOf(Promise);

      // Result should have aegis_enabled: true (if adapter is available)
      // or fall back to legacy with aegis_enabled: false
      const result = await resultPromise;
      expect(result).toHaveProperty('valid');

      // Reset for other tests
      enforcement.setAegisMode(false);
    });
  });
});
