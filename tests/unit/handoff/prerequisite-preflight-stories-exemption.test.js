/**
 * Tests for sd_type-aware exemption of USER_STORIES_MISSING preflight check.
 * SD-LEARN-FIX-ADDRESS-PAT-RETRO-003 (US-001, US-002)
 *
 * Verifies:
 * - shouldRequireUserStories() returns false for exempt sd_types
 * - shouldRequireUserStories() returns true for feature/bugfix/null/unknown
 * - checkPlanToExecPrereqs bypasses USER_STORIES_MISSING for exempt types
 * - checkPlanToExecPrereqs preserves USER_STORIES_MISSING for non-exempt types
 */
import { describe, it, expect } from 'vitest';
import {
  shouldRequireUserStories,
  runPrerequisitePreflight
} from '../../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';

describe('shouldRequireUserStories() helper', () => {
  describe('exempt sd_types (should return false)', () => {
    const EXEMPT = ['infrastructure', 'documentation', 'database', 'security', 'refactor'];
    EXEMPT.forEach((type) => {
      it(`returns false for sd_type='${type}'`, () => {
        expect(shouldRequireUserStories(type)).toBe(false);
      });
    });
  });

  describe('non-exempt sd_types (should return true)', () => {
    const REQUIRED = ['feature', 'bugfix'];
    REQUIRED.forEach((type) => {
      it(`returns true for sd_type='${type}'`, () => {
        expect(shouldRequireUserStories(type)).toBe(true);
      });
    });
  });

  describe('safe defaults (should return true)', () => {
    it('returns true for null', () => {
      expect(shouldRequireUserStories(null)).toBe(true);
    });

    it('returns true for undefined', () => {
      expect(shouldRequireUserStories(undefined)).toBe(true);
    });

    it('returns true for empty string', () => {
      expect(shouldRequireUserStories('')).toBe(true);
    });

    it('returns true for unknown sd_type string', () => {
      expect(shouldRequireUserStories('unknown_type')).toBe(true);
    });

    it('returns true for non-string types (numbers, objects)', () => {
      expect(shouldRequireUserStories(42)).toBe(true);
      expect(shouldRequireUserStories({})).toBe(true);
      expect(shouldRequireUserStories([])).toBe(true);
    });
  });
});

describe('checkPlanToExecPrereqs USER_STORIES bypass behavior', () => {
  function makeMockSupabase({ sdRow, prdRow, storyRows = [] }) {
    return {
      from: (table) => {
        if (table === 'user_stories') {
          return {
            select: () => ({
              eq: async () => ({ data: storyRows, error: null })
            })
          };
        }
        const builder = {
          select: () => builder,
          eq: () => builder,
          single: async () => {
            if (table === 'strategic_directives_v2') return { data: sdRow, error: null };
            if (table === 'product_requirements_v2') return { data: prdRow || null, error: null };
            return { data: null, error: null };
          }
        };
        return builder;
      }
    };
  }

  it('bypasses USER_STORIES_MISSING for sd_type=infrastructure (no stories)', async () => {
    const sd = {
      id: 'SD-TEST-INFRA-001',
      sd_key: 'SD-TEST-INFRA-001',
      sd_type: 'infrastructure',
      smoke_test_steps: [],
      success_criteria: [{ criterion: 'x', measure: 'y' }]
    };
    const prd = { id: 'PRD-1', status: 'approved', executive_summary: 'a'.repeat(60) };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, storyRows: [] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-TEST-INFRA-001');

    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain('USER_STORIES_MISSING');
    expect(codes).toContain('USER_STORIES_BYPASSED');
    const bypass = result.issues.find((i) => i.code === 'USER_STORIES_BYPASSED');
    expect(bypass.severity).toBe('info');
    expect(bypass.message).toContain('infrastructure');
    expect(bypass.message).toContain('CLAUDE_CORE.md');
  });

  it('bypasses USER_STORIES_MISSING for sd_type=documentation, database, security, refactor', async () => {
    const exemptTypes = ['documentation', 'database', 'security', 'refactor'];
    for (const sdType of exemptTypes) {
      const sd = {
        id: `SD-TEST-${sdType.toUpperCase()}-001`,
        sd_key: `SD-TEST-${sdType.toUpperCase()}-001`,
        sd_type: sdType,
        smoke_test_steps: [],
        success_criteria: [{ criterion: 'x', measure: 'y' }]
      };
      const prd = { id: 'PRD-1', status: 'approved', executive_summary: 'a'.repeat(60) };
      const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, storyRows: [] });

      const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', sd.sd_key);
      const codes = result.issues.map((i) => i.code);
      expect(codes, `${sdType} should bypass`).not.toContain('USER_STORIES_MISSING');
      expect(codes, `${sdType} should log bypass`).toContain('USER_STORIES_BYPASSED');
    }
  });

  it('preserves USER_STORIES_MISSING for sd_type=feature (no stories)', async () => {
    const sd = {
      id: 'SD-TEST-FEAT-001',
      sd_key: 'SD-TEST-FEAT-001',
      sd_type: 'feature',
      smoke_test_steps: [],
      success_criteria: [{ criterion: 'x', measure: 'y' }]
    };
    const prd = { id: 'PRD-1', status: 'approved', executive_summary: 'a'.repeat(60) };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, storyRows: [] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-TEST-FEAT-001');
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('USER_STORIES_MISSING');
    expect(codes).not.toContain('USER_STORIES_BYPASSED');
  });

  it('preserves USER_STORIES_MISSING for sd_type=bugfix (no stories)', async () => {
    const sd = {
      id: 'SD-TEST-BUG-001',
      sd_key: 'SD-TEST-BUG-001',
      sd_type: 'bugfix',
      smoke_test_steps: [],
      success_criteria: [{ criterion: 'x', measure: 'y' }]
    };
    const prd = { id: 'PRD-1', status: 'approved', executive_summary: 'a'.repeat(60) };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, storyRows: [] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-TEST-BUG-001');
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('USER_STORIES_MISSING');
    expect(codes).not.toContain('USER_STORIES_BYPASSED');
  });

  it('does not push USER_STORIES_MISSING when sd_type=feature has stories', async () => {
    const sd = {
      id: 'SD-TEST-FEAT-002',
      sd_key: 'SD-TEST-FEAT-002',
      sd_type: 'feature',
      smoke_test_steps: [],
      success_criteria: [{ criterion: 'x', measure: 'y' }]
    };
    const prd = { id: 'PRD-1', status: 'approved', executive_summary: 'a'.repeat(60) };
    const stories = [{ story_key: 'SD-TEST-FEAT-002:US-001' }];
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, storyRows: stories });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-TEST-FEAT-002');
    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain('USER_STORIES_MISSING');
    expect(codes).not.toContain('USER_STORIES_BYPASSED');
  });

  it('treats null sd_type as enforcement (safe default)', async () => {
    const sd = {
      id: 'SD-TEST-NULL-001',
      sd_key: 'SD-TEST-NULL-001',
      sd_type: null,
      smoke_test_steps: [],
      success_criteria: [{ criterion: 'x', measure: 'y' }]
    };
    const prd = { id: 'PRD-1', status: 'approved', executive_summary: 'a'.repeat(60) };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, storyRows: [] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-TEST-NULL-001');
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('USER_STORIES_MISSING');
    expect(codes).not.toContain('USER_STORIES_BYPASSED');
  });
});
