/**
 * Architectural Pattern Checklist Gate - Unit Tests
 * SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-C
 *
 * Tests:
 * - TS-1: Skips non-complex SDs (story_points < 8, LOC < 500, no children)
 * - TS-2: Runs for complex SDs (story_points >= 8)
 * - TS-3: Runs for complex SDs (LOC >= 500)
 * - TS-4: Runs for complex SDs (has children)
 * - TS-5: Returns 100% when all pattern categories found
 * - TS-6: Returns warnings when categories missing
 * - TS-7: Never blocks (passed=true even with missing patterns)
 * - TS-8: Handles missing PRD gracefully
 * - TS-9: Handles short PRD text gracefully
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createArchitecturalPatternChecklistGate } from '../../../scripts/modules/handoff/executors/plan-to-exec/gates/architectural-pattern-checklist.js';

// Suppress console output during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

function makePrd(overrides = {}) {
  return {
    id: 'prd-1',
    content: '',
    executive_summary: '',
    business_context: '',
    technical_context: '',
    system_architecture: '',
    implementation_approach: '',
    technical_requirements: '',
    non_functional_requirements: '',
    functional_requirements: null,
    risks: null,
    ...overrides
  };
}

function makeSd(overrides = {}) {
  return {
    id: 'sd-1',
    sd_key: 'SD-TEST-001',
    sd_type: 'feature',
    metadata: {},
    ...overrides
  };
}

function makeSupabase(children = []) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: children, error: null })
      })
    })
  };
}

function makePrdRepo(prd) {
  return {
    getBySdId: vi.fn().mockResolvedValue(prd)
  };
}

describe('GATE_ARCHITECTURAL_PATTERN_CHECKLIST', () => {
  let gate;

  describe('TS-1: Skips non-complex SDs', () => {
    test('should skip when story_points < 8, LOC < 500, no children', async () => {
      const sd = makeSd({ metadata: { story_points: 3, loc_estimate: 100 } });
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(makePrd());

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.details.status).toBe('SKIPPED');
      expect(result.details.reason).toBe('not_complex');
    });
  });

  describe('TS-2: Runs for complex SDs (story_points >= 8)', () => {
    test('should evaluate patterns when story_points >= 8', async () => {
      const sd = makeSd({ metadata: { story_points: 8 } });
      const prd = makePrd({
        content: 'This handles state management and error handling and observability'
      });
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(prd);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true);
      expect(result.details.status).not.toBe('SKIPPED');
    });
  });

  describe('TS-3: Runs for complex SDs (LOC >= 500)', () => {
    test('should evaluate patterns when LOC >= 500', async () => {
      const sd = makeSd({ metadata: { loc_estimate: 500 } });
      const prd = makePrd({
        content: 'This handles state management and error handling and observability'
      });
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(prd);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true);
      expect(result.details.status).not.toBe('SKIPPED');
    });
  });

  describe('TS-4: Runs for complex SDs (has children)', () => {
    test('should evaluate patterns when SD has children', async () => {
      const sd = makeSd();
      const prd = makePrd({
        content: 'This handles state management and error handling and observability'
      });
      const supabase = makeSupabase([{ id: 'child-1' }, { id: 'child-2' }]);
      const prdRepo = makePrdRepo(prd);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true);
      expect(result.details.status).not.toBe('SKIPPED');
    });
  });

  describe('TS-5: Returns 100% when all pattern categories found', () => {
    test('should score 100 when all 3 categories are present', async () => {
      const sd = makeSd({ metadata: { story_points: 13 } });
      const prd = makePrd({
        content: 'We use state management with Redux for the store.',
        technical_requirements: 'Implement error handling with circuit breaker pattern.',
        non_functional_requirements: 'Add observability with structured logging and metrics.'
      });
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(prd);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.details.status).toBe('PASS');
      expect(result.details.found_categories).toHaveLength(3);
      expect(result.details.missing_categories).toHaveLength(0);
    });
  });

  describe('TS-6: Returns warnings when categories missing', () => {
    test('should warn about missing categories', async () => {
      const sd = makeSd({ metadata: { story_points: 10 } });
      const prd = makePrd({
        content: 'We use state management with Redux for the store. This section describes how we will approach the implementation of the feature with careful attention to detail and thorough planning.'
        // No error handling or observability mentioned
      });
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(prd);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true);
      expect(result.score).toBeLessThan(100);
      expect(result.details.status).toBe('WARN');
      expect(result.details.missing_categories.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('should report 0% when no categories found', async () => {
      const sd = makeSd({ metadata: { story_points: 10 } });
      const prd = makePrd({
        content: 'This is a simple PRD with no architectural pattern keywords at all.'
      });
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(prd);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true); // Still passes - advisory only
      expect(result.score).toBe(0);
      expect(result.details.missing_categories).toHaveLength(3);
    });
  });

  describe('TS-7: Never blocks (passed=true even with missing patterns)', () => {
    test('should have required=false (advisory gate)', () => {
      const sd = makeSd();
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(null);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      expect(gate.required).toBe(false);
    });

    test('should always return passed=true regardless of score', async () => {
      const sd = makeSd({ metadata: { story_points: 20 } });
      const prd = makePrd({
        content: 'Nothing relevant here whatsoever.'
      });
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(prd);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true);
      expect(result.details.blocking).toBe(false);
    });
  });

  describe('TS-8: Handles missing PRD gracefully', () => {
    test('should return WARN when no PRD found', async () => {
      const sd = makeSd({ metadata: { story_points: 10 } });
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(null);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true);
      expect(result.score).toBe(50);
      expect(result.details.status).toBe('WARN');
      expect(result.details.reason).toBe('no_prd');
    });
  });

  describe('TS-9: Handles short PRD text gracefully', () => {
    test('should return WARN when PRD text is too short', async () => {
      const sd = makeSd({ metadata: { story_points: 10 } });
      const prd = makePrd({ content: 'Short.' });
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(prd);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      const result = await gate.validator({});

      expect(result.passed).toBe(true);
      expect(result.score).toBe(60);
      expect(result.details.status).toBe('WARN');
      expect(result.details.reason).toBe('prd_too_short');
    });
  });

  describe('Gate metadata', () => {
    test('should have correct gate name', () => {
      const sd = makeSd();
      const supabase = makeSupabase([]);
      const prdRepo = makePrdRepo(null);

      gate = createArchitecturalPatternChecklistGate(prdRepo, sd, supabase);
      expect(gate.name).toBe('GATE_ARCHITECTURAL_PATTERN_CHECKLIST');
    });
  });
});
