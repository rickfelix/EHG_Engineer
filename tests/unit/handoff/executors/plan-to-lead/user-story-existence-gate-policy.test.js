// QF-20260812-225 — USER_STORY_EXISTENCE_GATE (PLAN-TO-LEAD) hardcoded its own NO_STORIES_TYPES
// set instead of consulting lib/protocol-policies/orchestrator-bypass.js's STORY_EXEMPT_TYPES
// (the canonical, single-source-of-truth policy). Result: sd_type='security'/'database'/'refactor'
// SDs with zero user_stories hard-failed this gate despite being canonically exempt. 3rd confirmed
// occurrence of this gate-bug class (prior: QF-20260812-087).
//
// The fix is ADDITIVE: shouldBypassUserStories() is consulted alongside the existing local set,
// never replacing it -- the local set's extra members (bugfix, quick_fix, qa, uat, ux_debt, docs)
// are NOT all present in the canonical set (which governs a different requirement -- STORIES
// sub-agent execution at PLAN-TO-EXEC), so swapping outright would have un-exempted the most
// common sd_type in the fleet (bugfix) from this gate -- a regression far outside this QF's scope.
import { describe, it, expect } from 'vitest';
import { createUserStoryExistenceGate } from '../../../../../scripts/modules/handoff/executors/plan-to-lead/gates/user-story-existence.js';

function makeSupabase({ childSDs = [], profile = null, userStories = [] } = {}) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => Promise.resolve({ data: childSDs, error: null }) }) };
      }
      if (table === 'sd_type_validation_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve(
                profile ? { data: profile, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
              ),
            }),
          }),
        };
      }
      if (table === 'user_stories') {
        return { select: () => ({ eq: () => Promise.resolve({ data: userStories, error: null }) }) };
      }
      if (table === 'product_requirements_v2') {
        return { select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) };
      }
      throw new Error(`makeSupabase: unexpected table '${table}'`);
    },
  };
}

async function runGate(sdType, opts) {
  const gate = createUserStoryExistenceGate(makeSupabase(opts));
  return gate.validator({ sd: { id: 'sd-uuid-1', sd_type: sdType }, sdId: 'SD-TEST-001' });
}

describe('USER_STORY_EXISTENCE_GATE (QF-20260812-225) — canonical policy consulted additively', () => {
  it.each(['security', 'database', 'refactor'])(
    "REGRESSION: sd_type='%s' with zero user stories now passes (was hard-blocked before this fix)",
    async (sdType) => {
      const result = await runGate(sdType, {});
      expect(result.passed).toBe(true);
      expect(result.details.stories_required).toBe(false);
    }
  );

  it.each(['bugfix', 'quick_fix', 'qa', 'uat', 'ux_debt', 'infrastructure', 'documentation'])(
    "does not regress the EXISTING exemption for sd_type='%s' (not in the canonical set, but must stay exempt)",
    async (sdType) => {
      const result = await runGate(sdType, {});
      expect(result.passed).toBe(true);
      expect(result.details.stories_required).toBe(false);
    }
  );

  it("still BLOCKS a non-exempt sd_type ('feature') with zero user stories — the fix must not over-exempt", async () => {
    const result = await runGate('feature', { userStories: [] });
    expect(result.passed).toBe(false);
    expect(result.details.stories_required).toBe(true);
  });

  it('a DB-driven profile still takes precedence over both the local set and the canonical policy', async () => {
    const result = await runGate('security', { profile: { requires_user_stories: true, description: 'explicit profile override' } });
    expect(result.details.stories_required).toBe(true);
    expect(result.passed).toBe(false);
  });
});
