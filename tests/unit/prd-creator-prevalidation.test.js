/**
 * Tests for PRD creator pre-validation (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-077)
 * FR-001: executive_summary minimum enforcement at creation time
 * FR-002: functional_requirements minimum enforcement at creation time
 */
import { describe, it, expect, vi } from 'vitest';

// Mock supabase client
function createMockSupabase(existingPRD = null) {
  const mockSelect = vi.fn().mockReturnThis();
  const mockEq = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockReturnThis();
  const mockMaybeSingle = vi.fn().mockResolvedValue({ data: existingPRD, error: null });
  const mockInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: 'test-prd-id' }, error: null })
    })
  });

  return {
    from: vi.fn().mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      limit: mockLimit,
      maybeSingle: mockMaybeSingle,
      insert: mockInsert
    }),
    _mockInsert: mockInsert
  };
}

describe('PRD Creator Pre-Validation', () => {
  describe('FR-001: executive_summary minimum enforcement', () => {
    it('should reject createPRDWithValidatedContent with empty executive_summary', async () => {
      const { createPRDWithValidatedContent } = await import('../../scripts/prd/prd-creator.js');
      const supabase = createMockSupabase();

      await expect(
        createPRDWithValidatedContent(
          supabase, 'prd-1', 'SD-TEST-001', 'SD-TEST-001', 'Test PRD',
          { sd_type: 'infrastructure' },
          { executive_summary: '', functional_requirements: [{ id: 'FR-1' }] }
        )
      ).rejects.toThrow(/executive_summary.*too short/i);
    });

    it('should reject createPRDWithValidatedContent with short executive_summary', async () => {
      const { createPRDWithValidatedContent } = await import('../../scripts/prd/prd-creator.js');
      const supabase = createMockSupabase();

      await expect(
        createPRDWithValidatedContent(
          supabase, 'prd-1', 'SD-TEST-001', 'SD-TEST-001', 'Test PRD',
          { sd_type: 'infrastructure' },
          { executive_summary: 'Too short', functional_requirements: [{ id: 'FR-1' }] }
        )
      ).rejects.toThrow(/executive_summary.*too short/i);
    });

    it('should accept createPRDWithValidatedContent with valid executive_summary (50+ chars)', async () => {
      const { createPRDWithValidatedContent } = await import('../../scripts/prd/prd-creator.js');
      const supabase = createMockSupabase();

      // Should not throw for valid summary
      // Note: may still fail on other validation (validatePRDFields) - we only test the new check
      try {
        await createPRDWithValidatedContent(
          supabase, 'prd-1', 'SD-TEST-001', 'SD-TEST-001', 'Test PRD',
          { sd_type: 'infrastructure' },
          {
            executive_summary: 'This is a sufficiently long executive summary that meets the 50 character minimum requirement for PRD creation.',
            functional_requirements: [{ id: 'FR-1', requirement: 'Test requirement' }],
            acceptance_criteria: ['Test criterion'],
            test_scenarios: [{ id: 'TS-1' }]
          }
        );
      } catch (err) {
        // If it throws, it should NOT be about executive_summary
        expect(err.message).not.toMatch(/executive_summary.*too short/i);
      }
    });
  });

  describe('FR-002: functional_requirements minimum enforcement', () => {
    it('should reject createPRDWithValidatedContent with empty functional_requirements', async () => {
      const { createPRDWithValidatedContent } = await import('../../scripts/prd/prd-creator.js');
      const supabase = createMockSupabase();

      await expect(
        createPRDWithValidatedContent(
          supabase, 'prd-1', 'SD-TEST-001', 'SD-TEST-001', 'Test PRD',
          { sd_type: 'infrastructure' },
          {
            executive_summary: 'A sufficiently long executive summary that definitely exceeds the fifty character minimum.',
            functional_requirements: []
          }
        )
      ).rejects.toThrow(/functional_requirements.*empty/i);
    });

    it('should reject createPRDWithValidatedContent with null functional_requirements', async () => {
      const { createPRDWithValidatedContent } = await import('../../scripts/prd/prd-creator.js');
      const supabase = createMockSupabase();

      await expect(
        createPRDWithValidatedContent(
          supabase, 'prd-1', 'SD-TEST-001', 'SD-TEST-001', 'Test PRD',
          { sd_type: 'infrastructure' },
          {
            executive_summary: 'A sufficiently long executive summary that definitely exceeds the fifty character minimum.',
            functional_requirements: null
          }
        )
      ).rejects.toThrow(/functional_requirements.*empty/i);
    });
  });
});
