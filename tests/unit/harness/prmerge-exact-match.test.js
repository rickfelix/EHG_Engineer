// SD-LEO-INFRA-RESUME-FINAL-READ-001 (FR-5) — REWRITTEN. Supersedes QF-20260509-PRMERGE-EXACT.
//
// WHAT THIS FILE USED TO BE, AND WHY IT WAS REPLACED RATHER THAN EDITED.
// It pinned the ANCHORED regex `^(feat|fix|docs|test)/${sdIdEscaped}$` — six of its seven
// assertions were source-text greps against gates.js, and the seventh, labelled a "behavioral
// simulation", built its OWN RegExp and never read the code under test: it asserted V8 anchor
// semantics. So it was live, green, and structurally incapable of failing when the gate broke.
// It was also asserting the WRONG behaviour: the anchoring it pinned is what made an OPEN PR on
// `fix/SD-...-001-fr5-drop-recreate` invisible, letting an SD complete with its deliverable
// unmerged (2026-08-03).
//
// THE ESTATE MUST NOT HOLD TWO TESTS PINNING OPPOSITE BEHAVIOURS OF ONE FUNCTION. This file and
// scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js are
// rewritten to ONE semantics in the same change, per the coordinator's condition on the substrate
// change. See lib/git/branch-owner.js for the impossibility proof that killed the bounded widen:
// for key K and child key K-x, `<type>/K-x` is simultaneously a suffixed branch of K and the
// canonical branch of K-x, so no function of the branch NAME can be two-sided.
//
// EVERY ASSERTION BELOW DRIVES gate.validator. None greps source.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn(), execFileSync: vi.fn() }));

import { execSync, execFileSync } from 'child_process';
import {
  createPRMergeVerificationGate,
  createPRPrecheckGate,
} from '../../../scripts/modules/handoff/executors/lead-final-approval/gates.js';

/**
 * SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-1/FR-4): Scan A's `gh pr list --state open` call (and
 * others in gates.js) moved from execSync(shell string) to execFileSync(argv array) to close a
 * shell-injection sink. This file's mocks only drove execSync, so with the real code calling
 * execFileSync, the mock went silently dead here -- the exact "mock goes quietly dead on a
 * converted call site" bug class flagged in pr-merge-verification.test.js's own mockBothExecs
 * comment, missed in THIS sibling file during that conversion. Reconstructs an equivalent command
 * STRING from an execFileSync(file, args) call so every dispatch closure below keeps working for
 * both mock shapes.
 */
function mockBothExecs(dispatch) {
  execSync.mockImplementation(dispatch);
  execFileSync.mockImplementation((file, args) => dispatch([file, ...(args || [])].join(' ')));
}

const makeCtx = (sdKey) => ({
  sd: { id: 'test-uuid', sd_key: sdKey, sd_type: 'infrastructure', target_application: 'EHG_Engineer' },
  sdId: 'test-uuid',
});

/** An injected key-set loader — keeps the whole suite in the unit tier, no database. */
const keys = (...k) => async () => ({ ok: true, keys: new Set(k), reason: 'resolved', error: null });
const keysUnavailable = (error = 'simulated outage') => async () => ({
  ok: false, keys: new Set(), reason: 'key_set_unavailable', error,
});

/**
 * Drive the gate with a given set of OPEN PRs, MERGED PRs, and no local branches.
 * SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-1/FR-3): `mergedPrs` supplies Scan C's positive
 * evidence — without it, an SD with no open PR and no unmerged branch is indistinguishable from
 * one that was never pushed, and the third state (added by this SD) fails it.
 */
function mockGh({ openPrs = [], mergedPrs = [] } = {}) {
  mockBothExecs((cmd) => {
    if (cmd.includes('gh pr list') && cmd.includes('--state open')) return JSON.stringify(openPrs);
    if (cmd.includes('gh pr list') && cmd.includes('--state merged')) return JSON.stringify(mergedPrs);
    if (cmd.includes('git branch -r')) return '  origin/main\n';
    if (cmd.includes('git fetch')) return '';
    if (cmd.includes('rev-list')) return '0';
    if (cmd.includes('git for-each-ref')) return '';
    return '';
  });
}

const SD = 'SD-LEO-FEAT-STAGE-POST-LAUNCH-002';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('PR_MERGE_VERIFICATION resolves branch OWNERSHIP (replaces anchored matching)', () => {
  it('BLOCKS on an open PR whose branch carries a suffix — the case that shipped a false completion', async () => {
    // Verbatim shape of PR #6727. Under the anchored regex this PR was invisible and the gate
    // reported "No open PRs found for this SD" and passed.
    mockGh({ openPrs: [{ number: 6727, title: 'FR-5', headRefName: `fix/${SD}-fr5-drop-recreate`, url: 'u' }] });
    const gate = createPRMergeVerificationGate(null, { loadKeySet: keys(SD) });
    const r = await gate.validator(makeCtx(SD));
    expect(r.passed).toBe(false);
    expect(JSON.stringify(r.issues)).toContain('6727');
  });

  it('still BLOCKS on the canonical unsuffixed branch', async () => {
    mockGh({ openPrs: [{ number: 1, title: 't', headRefName: `feat/${SD}`, url: 'u' }] });
    const gate = createPRMergeVerificationGate(null, { loadKeySet: keys(SD) });
    expect((await gate.validator(makeCtx(SD))).passed).toBe(false);
  });

  it('does NOT block on a different SD whose key shares a prefix', async () => {
    // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-1/FR-3): SD itself has genuinely shipped
    // (mergedPrs below) — that positive evidence, not merely "no open PR for SD", is what makes
    // this legitimately PASS rather than never-pushed.
    mockGh({
      openPrs: [{ number: 2, title: 't', headRefName: 'feat/SD-LEO-FEAT-STAGE-POST-LAUNCH-003', url: 'u' }],
      mergedPrs: [{ number: 50, headRefName: `feat/${SD}`, url: 'u', mergedAt: '2026-01-01' }],
    });
    const gate = createPRMergeVerificationGate(null, { loadKeySet: keys(SD, 'SD-LEO-FEAT-STAGE-POST-LAUNCH-003') });
    expect((await gate.validator(makeCtx(SD))).passed).toBe(true);
  });

  it('does NOT block the PARENT when the open PR belongs to a CHILD key', async () => {
    // The K / K-x collision. A branch-name-only matcher cannot get this right, which is why the
    // gate resolves against the key set instead.
    // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-1/FR-3): the PARENT's own merged-PR evidence —
    // the assertion below expects PASS because the parent has genuinely shipped, not merely
    // because the child's open PR doesn't block it.
    const CHILD = `${SD}-A`;
    mockGh({
      openPrs: [{ number: 3, title: 't', headRefName: `feat/${CHILD}`, url: 'u' }],
      mergedPrs: [{ number: 51, headRefName: `feat/${SD}`, url: 'u', mergedAt: '2026-01-01' }],
    });
    const gate = createPRMergeVerificationGate(null, { loadKeySet: keys(SD, CHILD) });
    expect((await gate.validator(makeCtx(SD))).passed).toBe(true);
  });

  it('DOES block the child itself for that same branch', async () => {
    // Negative control for the test above: same input, different SD under test, opposite verdict.
    // If both passed under one rule the pair would prove nothing.
    const CHILD = `${SD}-A`;
    mockGh({ openPrs: [{ number: 3, title: 't', headRefName: `feat/${CHILD}`, url: 'u' }] });
    const gate = createPRMergeVerificationGate(null, { loadKeySet: keys(SD, CHILD) });
    expect((await gate.validator(makeCtx(CHILD))).passed).toBe(false);
  });

  it('VERDICT CHANGED by SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001: an unsupported branch type (chore/) now FAILS, with an honest message', async () => {
    // Real instance: PR #6664 on chore/SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001-approved-by-header.
    // 'chore' is deliberately NOT a recognized branch-type token (pinned so widening the token set
    // is a conscious decision, not silent drift) — that pre-existing, out-of-scope gap is untouched
    // by this SD. What DOES change: before this SD, "not recognized" fell all the way through to an
    // unconditional PASS. Now it reaches the never-pushed third state and FAILS instead — a
    // deliberate, justified verdict change (FR-3 AC-4), NOT a regression. The false-diagnosis risk
    // TESTING flagged (a message literally claiming "no branch was ever pushed" for a branch that
    // WAS pushed and has an open PR) is mitigated by the message wording itself: it states only what
    // was actually checked ("no open PR, no unmerged remote branch, and no merged PR evidence") and
    // enumerates the recognized branch types, rather than asserting nothing exists at all.
    mockGh({ openPrs: [{ number: 6664, title: 't', headRefName: `chore/${SD}-approved-by-header`, url: 'u' }] });
    const gate = createPRMergeVerificationGate(null, { loadKeySet: keys(SD) });
    const result = await gate.validator(makeCtx(SD));
    expect(result.passed).toBe(false);
    expect(result.details?.reason).toBe('never_pushed');
    expect(result.issues.join('\n')).toMatch(/no open PR, no unmerged remote branch, and no merged PR evidence/);
    expect(result.issues.join('\n')).not.toMatch(/6664/); // honest: we never actually found PR #6664
  });

  it('DELIBERATE REVERSAL: the 2026-05-07 branch now matches its own SD again', async () => {
    // QF-20260509 anchored the matcher to stop this branch blocking. That was an over-correction:
    // the branch is the SAME key suffixed, and the real fault was that it lived in a NON-TARGET
    // repo — since fixed independently by computeReposForSD. Resolving ownership reinstates the
    // match, and repo scoping (not the matcher) is what keeps it harmless. Pinned so the
    // reinstatement is visible rather than discovered.
    mockGh({ openPrs: [{ number: 9, title: 't', headRefName: `feat/${SD}-stage-25-post-launch-review-ehg-frontend`, url: 'u' }] });
    const gate = createPRMergeVerificationGate(null, { loadKeySet: keys(SD) });
    expect((await gate.validator(makeCtx(SD))).passed).toBe(false);
  });
});

describe('FR-4 — the key set is a new dependency, and it fails CLOSED', () => {
  it('BLOCKS when the key set cannot be loaded, with a resolver-attributable reason', async () => {
    // Asserted on details.resolver, NOT merely on passed===false: the validator's outer catch
    // already fails closed on any throw, so a bare passed===false assertion would go green with no
    // resolver logic at all. This is the discriminator.
    mockGh({ openPrs: [] });
    const gate = createPRMergeVerificationGate(null, { loadKeySet: keysUnavailable('db unreachable') });
    const r = await gate.validator(makeCtx(SD));
    expect(r.passed).toBe(false);
    expect(r.details?.resolver).toBe(true);
    expect(r.details?.reason).toBe('key_set_unavailable');
    expect(JSON.stringify(r.issues)).toContain('db unreachable');
  });

  it('an unavailable key set is NOT reported as "no open PRs found"', async () => {
    mockGh({ openPrs: [] });
    const gate = createPRMergeVerificationGate(null, { loadKeySet: keysUnavailable() });
    const r = await gate.validator(makeCtx(SD));
    expect(r.passed).toBe(false); // the fail-open would have been `true` here
  });

  // THE ADJACENT DOOR. The key-set guard above closed "lookup failed reads as nothing found" — and
  // forty lines away in the same function, a gh outage did exactly that: the per-repo catch logged
  // and continued, openPRs came back empty, and the gate returned passed:true / score:100. Found by
  // the EXEC TESTING sub-agent by probing the shipped gate, not by reading it.
  it('BLOCKS when a repo PR list cannot be read — an outage is not an all-clear', async () => {
    mockBothExecs((cmd) => {
      if (cmd.includes('gh pr list') && cmd.includes('--state open')) throw new Error('gh: auth token expired');
      if (cmd.includes('git branch -r')) return '  origin/main\n';
      return '';
    });
    const r = await createPRMergeVerificationGate(null, { loadKeySet: keys(SD) }).validator(makeCtx(SD));
    expect(r.passed).toBe(false);
    expect(r.details?.reason).toBe('repo_scan_unreadable');
    expect(JSON.stringify(r.issues)).toMatch(/auth token expired/);
  });

  it('the refusal names the unreadable repo rather than reporting a generic failure', async () => {
    mockBothExecs((cmd) => {
      if (cmd.includes('gh pr list') && cmd.includes('--state open')) throw new Error('API rate limit exceeded');
      if (cmd.includes('git branch -r')) return '  origin/main\n';
      return '';
    });
    const r = await createPRMergeVerificationGate(null, { loadKeySet: keys(SD) }).validator(makeCtx(SD));
    expect(r.details?.unreadableRepos?.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.issues)).toMatch(/rickfelix/);
  });
});

describe('PR_PRECHECK — same resolver, deliberately asymmetric on an unavailable key set', () => {
  it('blocks on a suffixed open PR', async () => {
    mockGh({ openPrs: [{ number: 6727, headRefName: `fix/${SD}-fr5-drop-recreate` }] });
    const gate = createPRPrecheckGate(null, { loadKeySet: keys(SD) });
    expect((await gate.validator(makeCtx(SD))).passed).toBe(false);
  });

  it('SKIPS (passes) when the key set is unavailable, and says so', async () => {
    // Not an oversight. PR_PRECHECK is a fast-fail optimisation whose existing catch already
    // returns passed:true on any error; its risk is carried entirely by PR_MERGE_VERIFICATION
    // blocking on the same condition (asserted above). Pinned so the asymmetry stays intentional.
    mockGh({ openPrs: [] });
    const gate = createPRPrecheckGate(null, { loadKeySet: keysUnavailable() });
    const r = await gate.validator(makeCtx(SD));
    expect(r.passed).toBe(true);
    expect(r.details?.deferred_to).toBe('PR_MERGE_VERIFICATION');
  });
});
