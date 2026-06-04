/**
 * Regression test for QF-20260604-797 / feedback a6cdecee.
 *
 * enhanceRetrospective() promotes an existing retro row (often the earlier
 * PLAN_TO_EXEC / LEAD_TO_PLAN handoff retro) into the canonical SD-completion
 * retro. It set retro_type='SD_COMPLETION' but used to leave retrospective_type
 * untouched, so a stale handoff-phase tag survived. The PLAN-TO-LEAD
 * RETROSPECTIVE_QUALITY_GATE filters PUBLISHED retros on
 *   retrospective_type IS NULL  OR  retrospective_type = 'SD_COMPLETION'
 * so the enhanced row matched neither branch and the gate hard-failed,
 * forcing manual reclassification. The fix clears retrospective_type to null,
 * matching the canonical fresh-insert writer.
 */

import { describe, it, expect } from 'vitest';
import { enhanceRetrospective } from './db-operations.js';

// Mock supabase that captures the payload passed to .update() and resolves the
// .from().update().eq().select().single() chain enhanceRetrospective uses.
function makeMockSupabase() {
  const calls = { updatePayload: null };
  const supabase = {
    from() {
      return {
        update(payload) {
          calls.updatePayload = payload;
          return {
            eq() {
              return {
                select() {
                  return {
                    single: async () => ({ data: { id: 'retro-1', ...payload }, error: null }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { supabase, calls };
}

// enhanceRetrospective takes a semanticDeduplicateArray(existing, incoming, type)
// helper; a simple concat is sufficient for asserting the written payload shape.
const passThroughDedup = (a, b) => [...(a || []), ...(b || [])];

const baseNewRetro = {
  quality_score: 100,
  title: 'Completion retro',
  description: 'completion description',
  conducted_date: '2026-06-04',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  team_satisfaction: 5,
  velocity_achieved: 1,
  business_value_delivered: 'value',
  key_learnings: ['l1'],
  what_went_well: ['w1'],
  what_needs_improvement: ['i1'],
  action_items: ['a1'],
  success_patterns: ['s1'],
  failure_patterns: ['f1'],
  protocol_improvements: [],
};

// The existing row started life as a handoff retro — the defect's precondition.
const baseExisting = {
  quality_score: 60,
  title: 'PLAN_TO_EXEC handoff retro',
  retro_type: 'SD_COMPLETION',
  retrospective_type: 'PLAN_TO_EXEC',
  key_learnings: [],
  what_went_well: [],
  what_needs_improvement: [],
  action_items: [],
  success_patterns: [],
  failure_patterns: [],
  protocol_improvements: [],
};

describe('enhanceRetrospective — retrospective_type normalization (QF-20260604-797 / a6cdecee)', () => {
  it('clears retrospective_type to null when promoting an enhanced row to SD_COMPLETION', async () => {
    const { supabase, calls } = makeMockSupabase();
    const res = await enhanceRetrospective(
      supabase,
      'retro-1',
      { ...baseNewRetro },
      { ...baseExisting },
      passThroughDedup
    );
    expect(res.success).toBe(true);
    expect(calls.updatePayload).toBeTruthy();
    // Core regression assertion: the stale 'PLAN_TO_EXEC' tag must be cleared.
    expect(calls.updatePayload.retrospective_type).toBeNull();
    expect(calls.updatePayload.retro_type).toBe('SD_COMPLETION');
  });

  it('produces a row the RETROSPECTIVE_QUALITY_GATE PUBLISHED filter accepts', async () => {
    const { supabase, calls } = makeMockSupabase();
    await enhanceRetrospective(
      supabase,
      'retro-1',
      { ...baseNewRetro },
      { ...baseExisting, retrospective_type: 'LEAD_TO_PLAN' },
      passThroughDedup
    );
    const rt = calls.updatePayload.retrospective_type;
    // Gate accepts when retrospective_type IS NULL OR = 'SD_COMPLETION'.
    expect(rt === null || rt === 'SD_COMPLETION').toBe(true);
  });
});
