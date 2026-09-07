// QF-20260905-843 -- a bugfix PRD's generic default exec_checklist (no user_story_ids) was
// pushed unconditionally, shadowing real functional_requirements: deliverables.length became
// non-zero from boilerplate checklist items alone, so the FR-extraction branch never ran.
// Reproduced live on SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C/D (4 real FRs, 0 or generic rows).
import { describe, it, expect, vi } from 'vitest';
import { extractAndPopulateDeliverables } from '../../../scripts/modules/handoff/extract-deliverables-from-prd.js';

const SD_ID = 'sd-test-id';

function makeSupabase({ existingDeliverables = [], userStories = [], sdType = 'bugfix', insertError = null } = {}) {
  const inserted = { rows: null };
  return {
    from(table) {
      if (table === 'sd_scope_deliverables') {
        return {
          select() {
            return {
              eq() {
                return { limit: async () => ({ data: existingDeliverables, error: null }) };
              },
            };
          },
          insert(rows) {
            inserted.rows = rows;
            return {
              select: async () => insertError
                ? { data: null, error: insertError }
                : { data: rows.map((r, i) => ({ id: `row-${i}`, ...r })), error: null },
            };
          },
        };
      }
      if (table === 'user_stories') {
        return { select() { return { eq: async () => ({ data: userStories, error: null }) }; } };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select() {
            return { eq() { return { single: async () => ({ data: { sd_type: sdType }, error: null }) }; } };
          },
        };
      }
      throw new Error(`Unexpected table in test mock: ${table}`);
    },
    __inserted: inserted,
  };
}

const DEFAULT_CHECKLIST = [
  { text: 'Core functionality implemented', checked: false },
];

const FOUR_FRS = [
  { id: 'FR-1', title: 'Promote the drift-detection step\'s real exit code' },
  { id: 'FR-2', title: 'Verify the promotion is currently a no-op' },
  { id: 'FR-3', title: 'Confirm the promotion cannot newly block any PR' },
  { id: 'FR-4', title: 'Regression-proof the fix with a mutation-verified test' },
];

describe('extractAndPopulateDeliverables (QF-20260905-843)', () => {
  it('a bugfix PRD with the generic default checklist + 4 FRs yields 4 FR-named rows, not generic checklist rows', async () => {
    const supabase = makeSupabase();
    const prd = { exec_checklist: DEFAULT_CHECKLIST, functional_requirements: FOUR_FRS };

    const result = await extractAndPopulateDeliverables(SD_ID, prd, supabase, { silent: true, skipIfExists: true });

    expect(result.success).toBe(true);
    expect(result.count).toBe(4);
    const names = result.deliverables.map((d) => d.deliverable_name);
    expect(names).toEqual([
      'Promote the drift-detection step\'s real exit code',
      'Verify the promotion is currently a no-op',
      'Confirm the promotion cannot newly block any PR',
      'Regression-proof the fix with a mutation-verified test',
    ]);
    expect(names).not.toContain('Core functionality implemented');
  });

  it('a checklist with at least one story-linked item still takes priority over functional_requirements', async () => {
    const supabase = makeSupabase({ userStories: [{ id: 'us-1', story_key: 'US-1' }] });
    const checklist = [{ text: 'Linked item', user_story_ids: ['US-1'] }];
    const prd = { exec_checklist: checklist, functional_requirements: FOUR_FRS };

    const result = await extractAndPopulateDeliverables(SD_ID, prd, supabase, { silent: true, skipIfExists: true });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.deliverables[0].deliverable_name).toBe('Linked item');
  });

  it('an unlinked checklist with NO functional_requirements falls back to the checklist itself (never "no deliverables")', async () => {
    const supabase = makeSupabase();
    const prd = { exec_checklist: DEFAULT_CHECKLIST, functional_requirements: [] };

    const result = await extractAndPopulateDeliverables(SD_ID, prd, supabase, { silent: true, skipIfExists: true });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.deliverables[0].deliverable_name).toBe('Core functionality implemented');
  });

  it('surfaces the real database error message on insert failure, not a generic swallow', async () => {
    const supabase = makeSupabase({ insertError: { message: 'column "foo" does not exist' } });
    const prd = { exec_checklist: DEFAULT_CHECKLIST, functional_requirements: FOUR_FRS };

    const result = await extractAndPopulateDeliverables(SD_ID, prd, supabase, { silent: true, skipIfExists: true });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Database insert failed: column "foo" does not exist');
  });
});
