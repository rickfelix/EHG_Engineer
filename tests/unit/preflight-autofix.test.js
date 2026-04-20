/**
 * Tests for prerequisite-preflight auto-fix functionality
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-122
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the sd-quality-scoring module
vi.mock('../../scripts/modules/sd-quality-scoring.js', () => ({
  SD_TYPE_THRESHOLDS: {
    infrastructure: { requiredFields: 6, minDescriptionWords: 50, passingScore: 65 },
    feature: { requiredFields: 8, minDescriptionWords: 100, passingScore: 70 },
  },
  DEFAULT_THRESHOLD: { requiredFields: 5, minDescriptionWords: 50, passingScore: 65 },
  JSONB_FIELDS: [
    'strategic_objectives', 'dependencies', 'implementation_guidelines',
    'success_criteria', 'success_metrics', 'key_changes', 'key_principles', 'risks',
  ],
}));

const { runPrerequisitePreflight } = await import(
  '../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js'
);

function createMockSupabase(sdData, updateError = null) {
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError })
  });
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: sdData, error: null })
        })
      }),
      update: updateFn,
    }),
    _updateFn: updateFn,
  };
}

describe('preflight-autofix', () => {
  describe('LEAD-TO-PLAN auto-fix', () => {
    it('auto-populates missing JSONB fields for infrastructure SD', async () => {
      const sd = {
        id: 'test-uuid',
        sd_key: 'SD-TEST-001',
        sd_type: 'infrastructure',
        description: 'This is a detailed description of the infrastructure changes needed to fix the handoff gate failures that have been recurring across multiple SD creation attempts in the pipeline workflow system. The root cause is that SDs created by automated systems lack required field completeness, causing LEAD-TO-PLAN and PLAN-TO-EXEC gates to reject at zero percent score. This SD addresses five distinct patterns with twenty total occurrences.',
        strategic_objectives: ['obj1'],
        success_criteria: [{ criterion: 'test', measure: 'pass' }],
        success_metrics: [{ metric: 'speed', target: 'fast' }],
        key_changes: [{ change: 'fix', impact: 'better' }],
        // Missing: risks, key_principles, implementation_guidelines, dependencies
        risks: [],
        key_principles: [],
        implementation_guidelines: null,
        dependencies: null,
        smoke_test_steps: [{ instruction: 'run test', expected_outcome: 'pass' }],
        rationale: 'Important fix',
        scope: 'In scope: fix things',
      };

      const supabase = createMockSupabase(sd);
      const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', 'SD-TEST-001');

      // The auto-fix should have populated the missing fields
      // After auto-fix, the SD should now have enough populated fields
      // 4 already populated + up to 4 auto-fixed = 8 total, well above 6 required
      expect(result.passed).toBe(true);
    });

    it('does NOT override existing non-empty fields', async () => {
      const existingRisks = [{ risk: 'existing risk', mitigation: 'existing mitigation' }];
      const sd = {
        id: 'test-uuid',
        sd_key: 'SD-TEST-002',
        sd_type: 'infrastructure',
        description: 'This is a detailed description of the infrastructure changes needed to fix the handoff gate failures that have been recurring across multiple SD creation attempts in the pipeline workflow system. The root cause is that SDs created by automated systems lack required field completeness, causing LEAD-TO-PLAN and PLAN-TO-EXEC gates to reject at zero percent score. This SD addresses five distinct patterns with twenty total occurrences.',
        strategic_objectives: ['obj1'],
        success_criteria: [{ criterion: 'test', measure: 'pass' }],
        success_metrics: [{ metric: 'speed', target: 'fast' }],
        key_changes: [{ change: 'fix', impact: 'better' }],
        risks: existingRisks,
        key_principles: ['existing principle'],
        implementation_guidelines: null,
        dependencies: null,
        smoke_test_steps: [{ instruction: 'run test', expected_outcome: 'pass' }],
      };

      const supabase = createMockSupabase(sd);
      await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', 'SD-TEST-002');

      // Verify risks were NOT overridden
      expect(sd.risks).toEqual(existingRisks);
      expect(sd.key_principles).toEqual(['existing principle']);
    });

    it('auto-extends short descriptions from rationale and scope', async () => {
      const sd = {
        id: 'test-uuid',
        sd_key: 'SD-TEST-003',
        sd_type: 'infrastructure',
        description: 'Short description here.',
        rationale: 'This is a very detailed rationale explaining why this work matters and should be done.',
        scope: 'IN SCOPE: Fix the preflight module. OUT OF SCOPE: Changing gate thresholds.',
        strategic_objectives: ['obj1'], success_criteria: [{ criterion: 'test', measure: 'pass' }],
        success_metrics: [{ metric: 'a', target: 'b' }], key_changes: [{ change: 'fix', impact: 'x' }],
        risks: [{ risk: 'r', mitigation: 'm' }], key_principles: ['p'],
        implementation_guidelines: ['g'], dependencies: [],
        smoke_test_steps: [{ instruction: 'run test', expected_outcome: 'pass' }],
        metadata: { source_items: ['PAT-001', 'PAT-002'] },
      };

      const supabase = createMockSupabase(sd);
      await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', 'SD-TEST-003');

      // After auto-fix, description should be extended
      expect(sd.description).toContain('Short description here.');
      expect(sd.description).toContain('Rationale');
      expect(sd.description).toContain('Scope');
    });
  });

  describe('PLAN-TO-EXEC chain diagnostic', () => {
    it('provides diagnostic when LEAD-TO-PLAN handoff missing', async () => {
      // This tests the prerequisite-check gate, not the preflight
      // but verifying the preflight still correctly reports PRD_MISSING
      const sd = {
        id: 'test-uuid',
        sd_key: 'SD-TEST-004',
        sd_type: 'infrastructure',
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'strategic_directives_v2') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: sd, error: null })
                })
              })
            };
          }
          if (table === 'product_requirements_v2') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null })
                })
              })
            };
          }
          if (table === 'user_stories') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            };
          }
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
        })
      };

      const result = await runPrerequisitePreflight(mockSupabase, 'PLAN-TO-EXEC', 'SD-TEST-004');
      expect(result.passed).toBe(false);
      expect(result.issues.some(i => i.code === 'PRD_MISSING')).toBe(true);
    });
  });
});
