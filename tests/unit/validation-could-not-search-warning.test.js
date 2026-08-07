// FR-4: a search that was ATTEMPTED and FAILED must reach the LEAD reader as a warning.
// SD-LEO-INFRA-VALIDATION-DUPE-DETECTION-DEAD-001.
//
// THIS FILE EXISTS BECAUSE THE BRANCH IT COVERS MEASURED 0% AND I NEARLY SHIPPED IT THAT WAY.
// A coverage run on the changed files reported lib/sub-agents/validation.js at 0/0/0/0 — the FR-4
// deliverable had no test at all, while every other discriminator in this SD was two-sided. The
// branch is ALSO unreachable in production today (its caller sits inside `if
// (indexStatus.available)` and codebase_semantic_index has never held a row), so without this file
// a guard that cannot fire yet and has never been executed by anything would be indistinguishable
// from one that does not work.
import { describe, it, expect } from 'vitest';
import { buildCouldNotSearchWarning } from '../../lib/sub-agents/validation.js';

describe('FR-4: could_not_search must not read as a clean result', () => {
  it('raises a HIGH warning naming the failure when the search could not run', () => {
    const w = buildCouldNotSearchWarning({
      search_status: 'could_not_search',
      queries_attempted: 3,
      queries_succeeded: 0,
      failure_reasons: ['rpc: Could not find the function public.semantic_code_search'],
    });
    expect(w).not.toBeNull();
    expect(w.severity).toBe('HIGH');
    expect(w.issue).toMatch(/DID NOT RUN/);
    expect(w.issue).toContain('0 of 3');
    expect(w.failure_reasons[0]).toMatch(/semantic_code_search/);
    // The recommendation must forbid the exact misreading this SD exists to prevent.
    expect(w.recommendation).toMatch(/absence of duplicates/i);
  });

  it('stays SILENT when the search genuinely ran — the other arm', () => {
    // Without this, an implementation that warned unconditionally would pass the test above and
    // make every clean validation look broken. A single arm is satisfiable by a constant.
    expect(buildCouldNotSearchWarning({ search_status: 'searched', queries_attempted: 3, queries_succeeded: 3 })).toBeNull();
  });

  it('stays silent for not_attempted and for a missing/blank result', () => {
    // not_attempted is a different state: nothing was tried, so there is nothing to warn about
    // here — the index-unavailable branch reports that case separately.
    expect(buildCouldNotSearchWarning({ search_status: 'not_attempted' })).toBeNull();
    expect(buildCouldNotSearchWarning({})).toBeNull();
    expect(buildCouldNotSearchWarning(null)).toBeNull();
    expect(buildCouldNotSearchWarning(undefined)).toBeNull();
  });

  it('degrades safely when the counters are absent', () => {
    const w = buildCouldNotSearchWarning({ search_status: 'could_not_search' });
    expect(w.issue).toContain('0 of 0');
    expect(w.failure_reasons).toEqual([]);
  });
});
