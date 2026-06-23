// SD-LEO-INFRA-PLANEXEC-PREFLIGHT-JSONB-PREP-001 (FR-2/FR-3/FR-4) — EARLY PLAN-TO-EXEC prep-readiness
// advisory reuses the gate's OWN prerequisite SSOT (checkPlanToExecPrereqs: PRD exists/approved/
// summary + user-stories). FR-1 data showed the real PLAN-TO-EXEC gaps are PRD/user-stories (not
// JSONB — that is a LEAD-TO-PLAN concern). Closing these early reduces REAL defects, not the bar.
import { describe, it, expect } from 'vitest';
import { runPlanPrepReadiness } from '../../scripts/plan-prep-readiness.js';

// Mock supabase: strategic_directives_v2 (.or().limit().maybeSingle()) returns the SD;
// product_requirements_v2 (.eq().single()) returns the PRD; user_stories (.eq()) returns stories.
function mockSb({ sd, prd, stories }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select() { return { or() { return { limit() { return { maybeSingle: () => Promise.resolve({ data: sd, error: null }) }; } }; } }; } };
      }
      if (table === 'product_requirements_v2') {
        return { select() { return { eq() { return { single: () => Promise.resolve({ data: prd, error: prd ? null : { message: 'no rows' } }) }; } }; } };
      }
      if (table === 'user_stories') {
        return { select() { return { eq: () => Promise.resolve({ data: stories || [], error: null }) }; } };
      }
      return null;
    },
  };
}

const featureSd = { sd_key: 'SD-TEST-PE-001', id: 'uuid-pe-1', sd_type: 'feature' };

describe('runPlanPrepReadiness — reuses the PLAN-TO-EXEC gate SSOT, surfaces gaps early', () => {
  it('flags PRD_MISSING + USER_STORIES_MISSING for a feature SD with no PRD/stories', async () => {
    const r = await runPlanPrepReadiness('SD-TEST-PE-001', { supabase: mockSb({ sd: featureSd, prd: null, stories: [] }) });
    expect(r.found).toBe(true);
    expect(r.ready).toBe(false);
    const codes = r.blocking.map(b => b.code);
    expect(codes).toContain('PRD_MISSING');
    expect(codes).toContain('USER_STORIES_MISSING');
  });

  it('flags PRD_NOT_APPROVED when the PRD exists but is in draft', async () => {
    const r = await runPlanPrepReadiness('SD-TEST-PE-001', {
      supabase: mockSb({ sd: featureSd, prd: { id: 'prd-1', status: 'draft', executive_summary: 'x'.repeat(60) }, stories: [{ story_key: 'a' }] }),
    });
    expect(r.ready).toBe(false);
    expect(r.blocking.map(b => b.code)).toContain('PRD_NOT_APPROVED');
  });

  it('marks an SD with an approved PRD + user stories as prep-ready', async () => {
    const r = await runPlanPrepReadiness('SD-TEST-PE-001', {
      supabase: mockSb({ sd: featureSd, prd: { id: 'prd-1', status: 'approved', executive_summary: 'x'.repeat(80) }, stories: [{ story_key: 'SD-TEST-PE-001:US-001' }] }),
    });
    expect(r.found).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.blocking.length).toBe(0);
  });

  it('returns found=false for a missing SD', async () => {
    const r = await runPlanPrepReadiness('SD-NOPE-001', { supabase: mockSb({ sd: null }) });
    expect(r.found).toBe(false);
    expect(r.ready).toBe(false);
  });
});
