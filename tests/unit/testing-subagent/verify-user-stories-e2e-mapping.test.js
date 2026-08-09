// QF-20260801-425 — TESTING blocked EXEC-TO-PLAN on a requirement 90% of the corpus cannot meet.
//
// WHAT THE FILED QF SAID, AND WHY IT IS WRONG ON MECHANISM. It reported that
// `user_stories.e2e_mapped` is selected and returns Postgres 42703 (undefined_column). It is
// not. `e2e_mapped` appears exactly once in the repo — phase4-evidence.js:109 — as a DERIVED
// OUTPUT field, `e2e_mapped: !!s.e2e_test_path`. The select at :60 reads only real columns.
// The author saw `e2e_mapped: false` in the blocking report and reasonably inferred a queried
// column; it is a correct rendering of a null path. A second plausible theory — case-sensitive
// comparison against UPPERCASE stored values — was also refuted: all 15,524 user_stories rows
// store lowercase (`completed`, `validated`, `passing`).
//
// THE ACTUAL DEFECT, measured. Clause 2 of the completeness filter demands an `e2e_test_path`
// for any SD whose type is not in E2E_EXEMPT_SD_TYPES. But 12,634 of 13,966 completed AND
// validated stories (90.5%) have `e2e_test_path` NULL, and nothing in the pipeline populates
// it for most stories. So the clause demands something nine-tenths of the corpus has never
// had and cannot obtain — which is why the reported SD failed three separate handoff attempts
// with no reachable remediation.
//
// THE INTERNAL TELL. Clause 3 already accepts `validation_status === 'validated'` as an
// alternative to a passing e2e run. Clause 2 accepts no alternative at all. The function
// disagrees with itself, and the canonical promoter
// (scripts/auto-validate-user-stories-on-exec-complete.js, which keys on validation_status)
// sides with clause 3. The fix makes clause 2 consistent with clause 3 — it does not remove
// a check, it removes a contradiction.
//
// This file is also the POSITIVE CONTROL. The first test below reproduces the exact blocking
// shape from the reported SD and fails against the pre-fix code. There was no coverage of
// verifyUserStories at all before this QF, which is how a self-contradicting filter survived.
import { describe, it, expect } from 'vitest';
import { verifyUserStories } from '../../../lib/sub-agents/testing/phases/phase4-evidence.js';

/** Minimal stub matching the one call shape: .from().select().eq() -> {data, error}. */
function stubSupabase(rows, error = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows, error }),
      }),
    }),
  };
}

/** The exact row shape of the 5 stories on the SD that blocked three times. */
function reportedStory(n) {
  return {
    story_key: `SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001:US-00${n}`,
    title: `Story ${n}`,
    status: 'completed',
    validation_status: 'validated',
    e2e_test_path: null,
    e2e_test_status: 'not_created',
  };
}

const REPORTED = [1, 2, 3, 4, 5].map(reportedStory);

describe('verifyUserStories — the QF-20260801-425 blocking shape', () => {
  // POSITIVE CONTROL. Against the pre-fix code this FAILS, which is what makes the
  // post-fix pass mean something. A fix verified only by a test written after it is a
  // tautology.
  it('accepts completed+validated stories with no e2e_test_path on a NON-exempt sd_type', async () => {
    const res = await verifyUserStories('sd-1', stubSupabase(REPORTED), { sdType: 'bugfix' });
    expect(res.verified).toBe(true);
    expect(res.incomplete).toEqual([]);
    expect(res.stories_count).toBe(5);
  });

  it('behaves identically for an exempt sd_type — the fix does not depend on the exemption list', async () => {
    const res = await verifyUserStories('sd-1', stubSupabase(REPORTED), { sdType: 'infrastructure' });
    expect(res.verified).toBe(true);
  });

  it('agrees with the canonical promoter, which keys on validation_status', async () => {
    // The promoter reports "All user stories already validated" for exactly these rows while
    // TESTING blocked them. Two checks disagreeing about what "done" means is the filed
    // complaint; this asserts they now agree.
    const res = await verifyUserStories('sd-1', stubSupabase(REPORTED), { sdType: 'feature' });
    expect(res.verified).toBe(true);
  });
});

describe('verifyUserStories — the check must still have teeth', () => {
  // Every acceptance above needs a rejection twin, or the "fix" is indistinguishable from
  // deleting the check. These are the cases that MUST still block.

  it('BLOCKS a story that is not completed', async () => {
    const rows = [{ ...reportedStory(1), status: 'ready' }];
    const res = await verifyUserStories('sd-1', stubSupabase(rows), { sdType: 'bugfix' });
    expect(res.verified).toBe(false);
    expect(res.incomplete).toHaveLength(1);
  });

  it('BLOCKS a completed story that is neither validated nor e2e-passing', async () => {
    // The case the e2e-mapping clause was really written for: no evidence of any kind.
    const rows = [{ ...reportedStory(1), validation_status: 'pending', e2e_test_status: 'not_created' }];
    const res = await verifyUserStories('sd-1', stubSupabase(rows), { sdType: 'bugfix' });
    expect(res.verified).toBe(false);
  });

  it('BLOCKS a completed, unvalidated story whose mapped e2e test is FAILING', async () => {
    const rows = [{
      ...reportedStory(1),
      validation_status: 'pending',
      e2e_test_path: 'tests/e2e/foo.spec.ts',
      e2e_test_status: 'failing',
    }];
    const res = await verifyUserStories('sd-1', stubSupabase(rows), { sdType: 'bugfix' });
    expect(res.verified).toBe(false);
  });

  // SD-LEO-INFRA-STORY-E2E-AUTO-001: this case previously used a path to a file that does not
  // exist ('tests/e2e/foo.spec.ts') and asserted ACCEPTED — it encoded the very defect that SD
  // measured, where 641 of 1390 rows claim a passing run of a spec nobody wrote. The INTENT
  // (a genuinely mapped, genuinely passing e2e run is accepted) is preserved by declaring the
  // file present, rather than by depending on a real fixture on disk.
  it('ACCEPTS a completed, unvalidated story whose mapped e2e test PASSES and whose spec EXISTS', async () => {
    const rows = [{
      ...reportedStory(1),
      validation_status: 'pending',
      e2e_test_path: 'tests/e2e/foo.spec.ts',
      e2e_test_status: 'passing',
    }];
    const res = await verifyUserStories('sd-1', stubSupabase(rows), {
      sdType: 'bugfix',
      specFileExists: () => true,
    });
    expect(res.verified).toBe(true);
  });

  it('reports a mixed set partially — only the genuinely incomplete story is named', async () => {
    const rows = [reportedStory(1), { ...reportedStory(2), status: 'draft', validation_status: 'pending' }];
    const res = await verifyUserStories('sd-1', stubSupabase(rows), { sdType: 'bugfix' });
    expect(res.verified).toBe(false);
    expect(res.incomplete).toHaveLength(1);
    expect(res.incomplete[0].story_key).toContain('US-002');
  });
});

describe('verifyUserStories — surrounding contract is unchanged', () => {
  it('an SD with no stories verifies, rather than blocking on an empty set', async () => {
    const res = await verifyUserStories('sd-1', stubSupabase([]), { sdType: 'bugfix' });
    expect(res.verified).toBe(true);
    expect(res.stories_count).toBe(0);
  });

  it('a query error reports verified:false with the error, never a silent pass', async () => {
    // A read that failed has not shown the stories to be complete. This is the same class as
    // the SD merged just before this QF: an unreadable input must never render as clean.
    const res = await verifyUserStories('sd-1', stubSupabase(null, { message: 'boom' }));
    expect(res.verified).toBe(false);
    expect(res.error).toBe('boom');
  });

  it('still derives e2e_mapped from e2e_test_path for the stories it does report', async () => {
    // The field the QF mistook for a column. It stays — it is a correct rendering, and the
    // blocking report is less legible without it.
    const rows = [{ ...reportedStory(1), status: 'draft', validation_status: 'pending' }];
    const res = await verifyUserStories('sd-1', stubSupabase(rows), { sdType: 'bugfix' });
    expect(res.incomplete[0].e2e_mapped).toBe(false);
  });
});
