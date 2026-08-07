/**
 * QF-20260727-714 — completing a QF whose deliverable is not code.
 *
 * validatePR unconditionally requires a github.com URL, so a QF delivering a DB write, a
 * refutation, or a decision could not be completed by the harness at all. --auto-pr is not a
 * path: it DEFERS validation to a post-push `gh pr create`, which correctly refuses with
 * "No commits between main and main" on an empty branch. The only remaining route was a
 * coordinator hand-writing the row out-of-band — twice observed (QF-20260727-154, and
 * QF-20260727-344 closed by direct row write on 2026-08-04).
 *
 * The danger in fixing it is obvious: an unguarded exemption turns the PR requirement off for
 * everyone. So the tests are TWO-SIDED — the flag must be refused without evidence, AND the
 * normal path must still demand a PR. Either assertion alone would pass on a broken fix.
 */
import { describe, it, expect } from 'vitest';
import { parseArguments } from '../../../scripts/modules/complete-quick-fix/cli.js';
import { validatePR } from '../../../scripts/modules/complete-quick-fix/verification.js';

const QF = 'QF-20260727-714';

describe('QF-714 — the flag cannot be used without evidence', () => {
  it('REFUSES --no-code-deliverable with no --deliverable-evidence', () => {
    // THE LOAD-BEARING ASSERTION. An evidence-free no-code completion is a vanity completion:
    // nothing to review, nothing to audit, and the PR gate silently off.
    expect(() => parseArguments([QF, '--no-code-deliverable']))
      .toThrow(/NO_CODE_DELIVERABLE_NO_EVIDENCE/);
  });

  it('the refusal names the flag that fixes it', () => {
    expect(() => parseArguments([QF, '--no-code-deliverable']))
      .toThrow(/--deliverable-evidence/);
  });

  it('CONTROL — with evidence it parses, so the refusal is a guard and not a dead flag', () => {
    const { options } = parseArguments([QF, '--no-code-deliverable', '--deliverable-evidence', 'wrote feedback row b307d75b']);
    expect(options.noCodeDeliverable).toBe(true);
    expect(options.deliverableEvidence).toBe('wrote feedback row b307d75b');
  });

  it('defaults to OFF when the flag is absent', () => {
    const { options } = parseArguments([QF, '--pr-url', 'https://github.com/o/r/pull/1']);
    expect(options.noCodeDeliverable).toBe(false);
    expect(options.deliverableEvidence).toBeUndefined();
  });
});

describe('QF-714 — the normal path is untouched', () => {
  it('validatePR STILL rejects a missing or non-github URL', () => {
    // The fix exempts a scoped path; it must not weaken the predicate itself. If this ever goes
    // green for a bad URL, the exemption has become a universal bypass.
    expect(validatePR(undefined, QF, 't')).toBe(false);
    expect(validatePR('', QF, 't')).toBe(false);
    expect(validatePR('https://gitlab.com/o/r/merge_requests/1', QF, 't')).toBe(false);
  });

  it('validatePR still accepts a real PR URL', () => {
    expect(validatePR('https://github.com/rickfelix/EHG_Engineer/pull/6824', QF, 't')).toBe(true);
  });

  it('--deliverable-evidence alone does NOT enable the exemption', () => {
    // Guards against the inverse mistake: treating the presence of evidence as the switch, which
    // would let an ordinary code QF skip its PR by passing a note.
    const { options } = parseArguments([QF, '--deliverable-evidence', 'some note']);
    expect(options.noCodeDeliverable).toBe(false);
  });
});

describe('QF-714 — the completion is labelled honestly', () => {
  it('force_completed is set for a no-code completion', async () => {
    // No PR was reviewed and no diff merged, so the row must not read like an ordinary verified
    // completion. force_completed also satisfies completed_requires_verification WITHOUT
    // fabricating uat_verified — the contract this file already documents for --force-complete.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('scripts/modules/complete-quick-fix/orchestrator.js', 'utf8'));
    expect(src).toMatch(/force_completed:\s*Boolean\(options\.forceComplete\s*\|\|\s*options\.noCodeDeliverable\)/);
  });

  it('the evidence is persisted to verification_notes, not just accepted', () => {
    // Accepting evidence and dropping it would leave the completion unauditable — the exact
    // failure this QF exists to fix, with an extra flag.
    const src = require('node:fs').readFileSync('scripts/modules/complete-quick-fix/orchestrator.js', 'utf8');
    expect(src).toMatch(/deliverable_evidence:\s*options\.deliverableEvidence/);
    expect(src).toMatch(/no_code_deliverable:\s*true/);
  });
});
