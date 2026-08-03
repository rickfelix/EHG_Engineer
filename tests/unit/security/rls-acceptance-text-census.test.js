// SELF-TEST for the SURVEY-4/6 acceptance-text classifier.
//
// WHY THIS FILE EXISTS. classify() encodes the exact ABSENT / PRESENT-BUT-UNQUOTED /
// PRESENT-AND-HALF-RIGHT distinction this SD says people mis-apply — 4 of 7 SURVEY-1 items were
// mis-bucketed on precisely that difference — and it shipped with no tests. Its discrimination was
// asserted in a docstring, next to a sibling template whose own docstring says a claim that nothing
// checks is not a claim. Raised by the TESTING sub-agent at EXEC-TO-PLAN.
//
// EVERY ARM MUST DISAGREE WITH ANOTHER. A classifier suite where each case expects the same bucket is
// satisfied by a constant function; that vacuity was caught once already in this SD's own PRD draft.
import { describe, it, expect } from 'vitest';
import { classify } from '../../../scripts/security/rls-acceptance-text-census.mjs';

// Realistic acceptance text, not keyword soup — the classifier is only useful on prose of this shape.
const ABSENT_TEXT =
  'Acceptance: anon INSERT into the table must fail with 42501 (row-level security). Verify the error code is returned.';
const UNQUOTED_TEXT =
  'Acceptance: anon INSERT must be denied by RLS (42501). Note that the service-role client bypasses policies, so readback behaves differently.';
const HALF_RIGHT_TEXT =
  'Acceptance: anon INSERT must be denied (42501, row-level security). Then verify the row is absent using the service role client.';
const SUFFICIENT_TEXT =
  'Acceptance: anon INSERT must be denied (42501, RLS). Verify the row is absent via the service role, then re-attempt the identical write without returning and read back again.';

describe('SURVEY-6 — the provenance classifier DISCRIMINATES', () => {
  it('ABSENT: infers enforcement from the error code, never confirms the row', () => {
    expect(classify(ABSENT_TEXT)).toBe('ABSENT');
  });
  it('PRESENT-BUT-UNQUOTED: mentions readback without prescribing it as the check', () => {
    expect(classify(UNQUOTED_TEXT)).toBe('PRESENT-BUT-UNQUOTED');
  });
  it('PRESENT-AND-HALF-RIGHT: prescribes a readback but stops at two legs', () => {
    expect(classify(HALF_RIGHT_TEXT)).toBe('PRESENT-AND-HALF-RIGHT');
  });
  it('SUFFICIENT: reaches the third leg', () => {
    expect(classify(SUFFICIENT_TEXT)).toBe('SUFFICIENT');
  });

  it('all four buckets are distinct in ONE assertion — a constant function fails here', () => {
    const verdicts = [ABSENT_TEXT, UNQUOTED_TEXT, HALF_RIGHT_TEXT, SUFFICIENT_TEXT].map(classify);
    expect(new Set(verdicts).size).toBe(4);
  });
});

describe('SURVEY-6 — the three conjuncts each actually gate', () => {
  // The first filter used the generic vocabulary of rejection and returned 3191 of 38165 rows against
  // an independent measurement of 16+22. It was not finding permission claims; it was finding the
  // word "rejected". These arms pin each conjunct so that regression cannot return silently.
  it('no permission token -> not a finding, however rejection-flavoured the text', () => {
    expect(classify('Acceptance: the request must fail and the submission should be rejected with an error.')).toBeNull();
  });
  it('no acceptance frame -> not a finding (narrative prose is not a criterion)', () => {
    expect(classify('The 42501 permission denied incident last week was caused by a policy change.')).toBeNull();
  });
  it('no negative-probe shape -> not a finding (a positive RLS statement is not a probe)', () => {
    expect(classify('Acceptance: verify the row-level security policy exists on the table.')).toBeNull();
  });
});

describe('SURVEY-6 — HALF-RIGHT outranks UNQUOTED, and SUFFICIENT outranks both', () => {
  // Order matters: text that PRESCRIBES a readback also MENTIONS one, and text with a third leg does
  // both. If the checks were ordered the other way the dangerous bucket would be reported as the safe
  // one — which is the mis-bucketing this column exists to prevent.
  it('text that prescribes AND mentions is HALF-RIGHT, not UNQUOTED', () => {
    expect(classify(HALF_RIGHT_TEXT)).not.toBe('PRESENT-BUT-UNQUOTED');
  });
  it('text with all three legs is SUFFICIENT, not HALF-RIGHT', () => {
    expect(classify(SUFFICIENT_TEXT)).not.toBe('PRESENT-AND-HALF-RIGHT');
  });
});
