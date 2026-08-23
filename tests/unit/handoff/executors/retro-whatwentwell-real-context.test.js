/**
 * QF-20260822-949 — lead-to-plan/retrospective.js and plan-to-exec/retrospective.js
 * previously built what_went_well from 5 fixed literal strings gated by a rating that
 * defaults to 4 in non-interactive mode, so virtually every automated handoff wrote all
 * 5, stamped is_boilerplate:false despite being template assertions (measured on live
 * retro 1908315c; see tests/unit/retro-boilerplate-template-corpus.test.js).
 *
 * Pins the fix: the exact non-interactive default-rating-4 scenario that used to trip
 * every anchored BOILERPLATE_PATTERN now derives content from the real SD instead.
 */

import { describe, it, expect, vi } from 'vitest';
import { RetrospectiveQualityRubric } from '../../../../scripts/modules/rubrics/retrospective-quality-rubric.js';

vi.mock('../../../../scripts/modules/handoff/lib/retro-clobber-guard.js', () => ({
  isSafeToWriteRetro: vi.fn().mockResolvedValue({ safe: true, reason: 'no_retro', existingRetro: null }),
}));

import { createHandoffRetrospective as createLeadToPlanRetro } from '../../../../scripts/modules/handoff/executors/lead-to-plan/retrospective.js';
import { createHandoffRetrospective as createPlanToExecRetro } from '../../../../scripts/modules/handoff/executors/plan-to-exec/retrospective.js';

const SD = {
  id: 'SD-TEST-WWW-001',
  sd_key: 'SD-TEST-WWW-001',
  sd_type: 'infrastructure',
  title: 'Test SD for what_went_well real-context fix',
};

const HANDOFF_RESULT = { success: true, qualityScore: 80 };

/** Minimal mock covering the from() calls both generators make. */
function buildMockSupabase() {
  let inserted = null;
  const chainable = (resolved) => {
    const node = {
      select: vi.fn(() => node),
      or: vi.fn(() => node),
      eq: vi.fn(() => node),
      order: vi.fn(() => node),
      limit: vi.fn(() => node),
      maybeSingle: vi.fn().mockResolvedValue(resolved),
      then: (resolve) => resolve(resolved), // await supabase.from(...).select().or().eq()
    };
    return node;
  };
  const supabase = {
    from: vi.fn((table) => {
      if (table === 'issue_patterns') return chainable({ data: [], error: null });
      if (table === 'retrospectives') {
        return {
          select: vi.fn(() => chainable({ data: null, error: null })),
          insert: vi.fn((data) => { inserted = data; return { select: vi.fn().mockResolvedValue({ data: [{ id: 'retro-001', ...data }], error: null }) }; }),
          update: vi.fn((data) => { inserted = data; return { eq: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [{ id: 'retro-001', ...data }], error: null }) })) }; }),
        };
      }
      return chainable({ data: [], error: null });
    }),
  };
  return { supabase, getInserted: () => inserted };
}

describe('what_went_well derives real context instead of fixed templates (QF-20260822-949)', () => {
  it('LEAD-TO-PLAN: non-interactive default ratings (the everyday trigger) produce no boilerplate matches', async () => {
    const { supabase, getInserted } = buildMockSupabase();
    await createLeadToPlanRetro('SD-TEST-WWW-001', SD, HANDOFF_RESULT, 'LEAD_TO_PLAN', supabase);

    const retro = getInserted();
    expect(retro.what_went_well.length).toBeGreaterThanOrEqual(1);
    const result = RetrospectiveQualityRubric.detectBoilerplate({ what_went_well: retro.what_went_well });
    expect(result.hasBoilerplate).toBe(false);
    expect(result.matchCount).toBe(0);
    // Real per-handoff context, not generic filler.
    expect(retro.what_went_well.some(w => w.achievement.includes('SD-TEST-WWW-001'))).toBe(true);
  });

  it('PLAN-TO-EXEC: non-interactive default ratings produce no boilerplate matches', async () => {
    const { supabase, getInserted } = buildMockSupabase();
    await createPlanToExecRetro(supabase, 'SD-TEST-WWW-001', SD, HANDOFF_RESULT, 'PLAN_TO_EXEC', {});

    const retro = getInserted();
    expect(retro.what_went_well.length).toBeGreaterThanOrEqual(1);
    const result = RetrospectiveQualityRubric.detectBoilerplate({ what_went_well: retro.what_went_well });
    expect(result.hasBoilerplate).toBe(false);
    expect(result.matchCount).toBe(0);
    expect(retro.what_went_well.some(w => w.achievement.includes('SD-TEST-WWW-001'))).toBe(true);
  });
});
