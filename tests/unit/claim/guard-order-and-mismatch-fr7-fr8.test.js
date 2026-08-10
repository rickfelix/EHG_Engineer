// SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-7 + FR-8).
//
// FR-7 IS A DISTINCTION, NOT A FEATURE: an ORDER clause cannot empty a result set; a FILTER can.
// resolveSessionClaimedSdKey returns null on an empty set and its caller FAILS OPEN, so adding
// `is_working_on=eq.true` as a FILTER would flip the guard from correctly BLOCKING to PERMITTING for
// a session holding exactly one claim with is_working_on=false. Ordering makes the pick
// deterministic without that risk, so ordering ships and filtering does not.
//
// THE MEASUREMENT IS A TRAP AND THE TEST SAYS SO. Re-measured 2026-08-03: 6 claiming sessions, ZERO
// currently in the at-risk state (the SD recorded 1 at authoring time). A reader measuring today
// would find no counterexample and conclude the filter is safe. It is safe by COINCIDENCE — nothing
// prevents that state tomorrow, and the failure is silent because a fail-open guard looks exactly
// like a guard with nothing to block.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOOK = fs.readFileSync(path.join(root, 'scripts/hooks/pre-tool-enforce.cjs'), 'utf8');
const RESUME = fs.readFileSync(path.join(root, 'lib/checkin/steps/resume.cjs'), 'utf8');

const resolveFn = (() => {
  const i = HOOK.indexOf('async function resolveSessionClaimedSdKey');
  return HOOK.slice(i, HOOK.indexOf('\n}\n', i));
})();

// ASSERT ON CODE, NOT PROSE. The function's comment necessarily CONTAINS the forbidden filter
// string, because it explains why that filter must not be added — so a naive match on the whole
// function body fails on correct code. (Caught exactly that way; it is the same shape as a guard
// that greps a command line and matches the explanation instead of the command.) Comments are
// stripped before any assertion about what the query actually does.
const resolveUrlLine = resolveFn
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('FR-7: ORDER ships, FILTER does not', () => {
  it('adds a deterministic same-table ORDER clause', () => {
    expect(resolveUrlLine).toMatch(/order=is_working_on\.desc,updated_at\.desc/);
  });

  // THE ASSERTION THAT MATTERS. A future reader "completing" the change by adding the filter would
  // silently convert this guard into a no-op for the exact sessions it exists to catch.
  it('does NOT add is_working_on as a FILTER — that can empty the set and fail the guard open', () => {
    expect(resolveUrlLine).not.toMatch(/is_working_on=eq\./);
    expect(resolveUrlLine).not.toMatch(/&is_working_on=/);
  });

  it('still returns null on an empty set, which is why the filter would be unsafe', () => {
    // The fail-open shape is intentional and stays; it is the REASON the filter is excluded, not a
    // defect to fix here.
    expect(resolveUrlLine).toMatch(/rows\.length > 0 \? rows\[0\] : null/);
    expect(resolveUrlLine).toMatch(/return row && row\.sd_key \? row\.sd_key : null/);
  });

  it('keeps limit=1 — ordering makes the single row deterministic rather than arbitrary', () => {
    expect(resolveUrlLine).toMatch(/limit=1/);
  });

  // Reads the UN-stripped source on purpose: this warning IS the comment. Losing it is how a future
  // reader re-measures, finds zero at-risk sessions, and concludes the filter is safe to add.
  it('records that the counterexample has since cleared, so the filter is not re-litigated as safe', () => {
    expect(resolveFn).toMatch(/COINCIDENCE/);
  });
});

describe('FR-8: resume detects MISMATCH and MULTIPLICITY, not just NULL', () => {
  const elseBranch = (() => {
    // ANCHORED, NOT POSITIONAL (SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 FR-1). This used to slice
    // from the FIRST `} else {` in the file. When FR-1 added an earlier `} else {` to the
    // !ctx.mySd branch, that slice silently began measuring a DIFFERENT branch — it happened to
    // fail loudly only because the new block contains healOwnClaimPointer. Had it not, every
    // assertion below would have gone GREEN while measuring code they were never about. Anchor on
    // the multiplicity branch's own marker so the region cannot drift.
    const marker = RESUME.indexOf('SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-8)');
    const i = RESUME.lastIndexOf('} else {', marker);
    return RESUME.slice(i, RESUME.indexOf('    // 4. already working', i));
  })();

  it('the slice actually landed on the multiplicity branch (anti-drift control)', () => {
    // Without this, a future edit that moves the anchor turns every assertion below into a
    // vacuous pass over the wrong region.
    expect(elseBranch).toMatch(/MULTIPLICITY/);
    expect(elseBranch).not.toMatch(/FR-1\): findOwnSdClaim answers the ownership/);
  });

  it('consults the authoritative source even when the mirror is NON-empty', () => {
    // The original code only looked when ctx.mySd was null, which is why both states were invisible.
    expect(elseBranch).toMatch(/getMyClaims/);
  });

  it('flags a mirror-vs-authoritative MISMATCH', () => {
    expect(elseBranch).toMatch(/claim_mirror_mismatch/);
    expect(elseBranch).toMatch(/!keys\.includes\(ctx\.mySd\)/);
  });

  it('flags MULTIPLICITY — a second held claim was previously unreachable through this path', () => {
    expect(elseBranch).toMatch(/claim_multiplicity/);
    expect(elseBranch).toMatch(/keys\.length > 1/);
  });

  // DETECTION ONLY, DELIBERATELY. Choosing a winner between two authoritative claims is a policy
  // call; guessing wrong silently drops real work. A future "helpful" auto-heal here would do
  // exactly that, so the boundary is pinned.
  it('does NOT self-heal — it reports and leaves the decision to a human or a later FR', () => {
    expect(elseBranch).not.toMatch(/healOwnClaimPointer/);
    expect(elseBranch).toMatch(/Detection only/);
  });

  // A read error is not evidence of agreement. Setting no flags on error is the honest outcome;
  // setting "agreed" would assert a comparison that never ran.
  it('leaves both flags unset when the authoritative read errored', () => {
    expect(elseBranch).toMatch(/if \(!error && claims\.length\)/);
    expect(elseBranch).toMatch(/A read error is NOT evidence of agreement/);
  });

  it('never breaks an otherwise valid resume', () => {
    expect(elseBranch).toMatch(/catch \{ \/\* detection is additive/);
  });
});
