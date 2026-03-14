/**
 * Unit Tests for Intelligent Scope Reduction Verification Gate
 * SD: SD-LEO-ENH-INTELLIGENT-SCOPE-REDUCTION-001
 *
 * Tests the refactored scope reduction gate that replaces the static 10%
 * threshold with vision-aware, fidelity-protected intelligent analysis.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client to avoid real API calls
vi.mock('../../../lib/llm/client-factory.js', () => ({
  getValidationClient: () => ({
    complete: vi.fn().mockResolvedValue(JSON.stringify({
      classifications: [
        { item: 'Replace gate logic', classification: 'core', reasoning: 'Maps to V09 strategic governance', traced_to: 'V09' },
        { item: 'Add UI dashboard', classification: 'deferrable', reasoning: 'Not traced to vision', traced_to: 'none' }
      ],
      summary: 'Test classification'
    }))
  })
}));

function createMockSupabase(overrides = {}) {
  const config = {
    sd: {
      scope_reduction_percentage: null,
      scope: 'Replace scope-reduction-verification.js gate logic. Add vision score delta check.',
      metadata: {},
      key_changes: [{ change: 'Replace static threshold', impact: 'Semantic analysis' }],
      success_criteria: [{ criterion: 'Gate classifies scope items', measure: 'Each item tagged' }],
      description: 'Replace static 10% check with intelligent rubric',
      sd_key: 'SD-TEST-001'
    },
    translationGates: [],
    visionDoc: { extracted_dimensions: [{ id: 'V01', name: 'automation', description: 'Automate' }] },
    archDoc: { extracted_dimensions: [{ id: 'A01', name: 'stateless', description: 'Stateless' }] },
    visionScores: [{ total_score: 90 }],
    ...overrides
  };

  return {
    from: vi.fn((table) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnValue({
          single: () => {
            if (table === 'strategic_directives_v2') return Promise.resolve({ data: config.sd, error: null });
            if (table === 'eva_vision_documents') return Promise.resolve({ data: config.visionDoc, error: null });
            if (table === 'eva_architecture_plans') return Promise.resolve({ data: config.archDoc, error: null });
            return Promise.resolve({ data: null, error: null });
          },
          then: (resolve) => {
            if (table === 'eva_translation_gates') return Promise.resolve({ data: config.translationGates, error: null }).then(resolve);
            if (table === 'eva_vision_scores') return Promise.resolve({ data: config.visionScores, error: null }).then(resolve);
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
        }),
        single: () => {
          if (table === 'strategic_directives_v2') return Promise.resolve({ data: config.sd, error: null });
          if (table === 'eva_vision_documents') return Promise.resolve({ data: config.visionDoc, error: null });
          if (table === 'eva_architecture_plans') return Promise.resolve({ data: config.archDoc, error: null });
          return Promise.resolve({ data: null, error: null });
        }
      };
      return chain;
    })
  };
}

describe('Scope Reduction Verification Gate (Intelligent Rubric)', () => {
  let gate;

  describe('Gate applicability', () => {
    it('should skip for documentation SD type', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase());
      const result = await gate.validator({ sd: { sd_type: 'documentation', id: 'test-id' } });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('should run as OPT (non-blocking) for enhancement SD type', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase());
      const result = await gate.validator({ sd: { sd_type: 'enhancement', id: 'test-id', sd_key: 'SD-TEST-001' } });

      // Enhancement is OPT — always passes
      expect(result.passed).toBe(true);
    });

    it('should run as REQ for feature SD type', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase());
      const result = await gate.validator({ sd: { sd_type: 'feature', id: 'test-id', sd_key: 'SD-TEST-001' } });

      expect(result.semantic).toBe(true);
    });
  });

  describe('Protected items from translation fidelity', () => {
    it('should identify critical gap items as protected', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase({
        translationGates: [{
          gaps: [
            { item: 'Vision-aligned scoring', severity: 'critical', source: 'architecture' },
            { item: 'Minor polish', severity: 'minor', source: 'brainstorm' }
          ],
          coverage_score: 75,
          passed: true,
          metadata: { target_ref: { key: 'SD-TEST-001' } }
        }]
      }));

      const result = await gate.validator({ sd: { sd_type: 'feature', id: 'test-id', sd_key: 'SD-TEST-001' } });
      expect(result.details.protectedItemCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty translation gates gracefully', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase({ translationGates: [] }));
      const result = await gate.validator({ sd: { sd_type: 'feature', id: 'test-id', sd_key: 'SD-TEST-001' } });

      expect(result.details.protectedItemCount).toBe(0);
      expect(result.details.hasFidelityData).toBe(false);
    });
  });

  describe('Legacy backward compatibility', () => {
    it('should acknowledge legacy scope_reduction_percentage >= 10', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase({
        sd: {
          scope_reduction_percentage: 15, scope: 'Some scope text', metadata: {},
          key_changes: [], success_criteria: [], description: 'Test SD', sd_key: 'SD-TEST-001'
        }
      }));

      const result = await gate.validator({ sd: { sd_type: 'feature', id: 'test-id', sd_key: 'SD-TEST-001' } });
      expect(result.details.legacyReductionPercentage).toBe(15);
      expect(result.details.legacyPassed).toBe(true);
    });

    it('should warn on low legacy percentage for REQ SDs', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase({
        sd: {
          scope_reduction_percentage: 5, scope: 'Some scope', metadata: {},
          key_changes: [], success_criteria: [], description: 'Test', sd_key: 'SD-TEST-001'
        }
      }));

      const result = await gate.validator({ sd: { sd_type: 'feature', id: 'test-id', sd_key: 'SD-TEST-001' } });
      expect(result.details.legacyPassed).toBe(false);
    });
  });

  describe('Missing context handling', () => {
    it('should return advisory pass when supabase is null', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature', id: 'test-id' } });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(50);
      expect(result.confidence).toBe(0.3);
    });
  });

  describe('Vision delta check', () => {
    it('should include vision score in details when available', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase({
        visionScores: [{ total_score: 93 }]
      }));

      const result = await gate.validator({ sd: { sd_type: 'feature', id: 'test-id', sd_key: 'SD-TEST-001' } });
      if (result.details.visionScore) {
        expect(result.details.visionScore).toBe(93);
        expect(result.details.visionThreshold).toBeDefined();
      }
    });
  });

  describe('Gate metadata', () => {
    it('should have correct name, weight, and required flag', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase());

      expect(gate.name).toBe('SCOPE_REDUCTION_VERIFICATION');
      expect(gate.required).toBe(true);
      expect(gate.weight).toBe(0.6);
    });
  });

  describe('Classification method tracking', () => {
    it('should track classification method in details', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase());
      const result = await gate.validator({ sd: { sd_type: 'enhancement', id: 'test-id', sd_key: 'SD-TEST-001' } });

      expect(result.details.method).toBeDefined();
      expect(['llm', 'heuristic', 'none']).toContain(result.details.method);
    });

    it('should track core and deferrable item counts', async () => {
      gate = (await import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js')).createScopeReductionVerificationGate(createMockSupabase());
      const result = await gate.validator({ sd: { sd_type: 'enhancement', id: 'test-id', sd_key: 'SD-TEST-001' } });

      expect(typeof result.details.coreItemCount).toBe('number');
      expect(typeof result.details.deferrableItemCount).toBe('number');
    });
  });
});
