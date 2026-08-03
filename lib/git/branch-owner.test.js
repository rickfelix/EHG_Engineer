// SD-LEO-INFRA-RESUME-FINAL-READ-001 — behavioural tests for branch→owner resolution.
//
// EVERY ASSERTION HERE CALLS THE MODULE. None inspects source text. That constraint is in the PRD
// because the test this SD replaces (tests/unit/harness/prmerge-exact-match.test.js) was 6/7
// source-text greps whose one "behavioral simulation" rebuilt its own RegExp and never read the
// code under test — a live, green, cannot-fire test that was cited as authoritative.
//
// The suite is written so each case fails if the specific behaviour it guards is removed. Where a
// case could pass for the wrong reason, it is paired with the case that discriminates.

import { describe, it, expect } from 'vitest';
import {
  resolveBranchOwner,
  branchBelongsToSd,
  loadKeySet,
  assertTypeTokensPrefixFree,
  BRANCH_TYPE_TOKENS,
  OWNER_REASON,
} from './branch-owner.js';

// The witnessed incident, verbatim.
const LOOP_KEY = 'SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001';
const LOOP_SUFFIXED = 'fix/SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001-fr5-drop-recreate';

describe('resolveBranchOwner — the blind spot that shipped a false completion', () => {
  it('resolves a SUFFIXED branch to its key (the anchored regex returned nothing here)', () => {
    const r = resolveBranchOwner(LOOP_SUFFIXED, [LOOP_KEY]);
    expect(r.owner).toBe(LOOP_KEY);
    expect(r.reason).toBe(OWNER_REASON.RESOLVED);
  });

  it('still resolves the canonical unsuffixed branch', () => {
    expect(resolveBranchOwner(`feat/${LOOP_KEY}`, [LOOP_KEY]).owner).toBe(LOOP_KEY);
  });

  it('strips origin/ (the branch scan feeds names in that form)', () => {
    expect(resolveBranchOwner(`origin/${LOOP_SUFFIXED}`, [LOOP_KEY]).owner).toBe(LOOP_KEY);
  });
});

describe('the K / K-x collision that made a branch-name-only matcher impossible', () => {
  const PARENT = 'SD-MAN-ORCH-PIPELINE-001';
  const CHILD = 'SD-MAN-ORCH-PIPELINE-001-A';
  const keys = [PARENT, CHILD];

  // THIS is the case a widened regex cannot get right: `feat/<CHILD>` is simultaneously a suffixed
  // branch of PARENT and the canonical branch of CHILD. Longest match decides it; nothing about the
  // string alone can.
  it('a child-key branch belongs to the CHILD, not the parent', () => {
    const r = resolveBranchOwner(`feat/${CHILD}`, keys);
    expect(r.owner).toBe(CHILD);
    expect(r.candidates).toEqual(expect.arrayContaining([PARENT, CHILD]));
  });

  it('so it does NOT block the parent', () => {
    expect(branchBelongsToSd(`feat/${CHILD}`, PARENT, keys).belongs).toBe(false);
    expect(branchBelongsToSd(`feat/${CHILD}`, CHILD, keys).belongs).toBe(true);
  });

  // Negative control for the case above: without the child key present, the SAME string belongs to
  // the parent. If this and the previous test both passed under any single rule, the pair would be
  // proving nothing — they disagree by design, which is what makes them load-bearing.
  it('the SAME branch belongs to the PARENT when the child key does not exist', () => {
    expect(resolveBranchOwner(`feat/${CHILD}`, [PARENT]).owner).toBe(PARENT);
  });

  it('a deeper descendant still wins over both', () => {
    const GRAND = `${CHILD}-B`;
    expect(resolveBranchOwner(`feat/${GRAND}`, [PARENT, CHILD, GRAND]).owner).toBe(GRAND);
  });
});

describe('the hyphen boundary — a widen that skips it silently steals branches', () => {
  it('SD-FOO-001 does not claim the branch of SD-FOO-0012', () => {
    const r = resolveBranchOwner('feat/SD-FOO-0012', ['SD-FOO-001']);
    expect(r.owner).toBeNull();
    expect(r.reason).toBe(OWNER_REASON.NO_MATCHING_KEY);
  });

  it('but it does claim SD-FOO-001-anything', () => {
    expect(resolveBranchOwner('feat/SD-FOO-001-anything', ['SD-FOO-001']).owner).toBe('SD-FOO-001');
  });
});

describe('reasons stay distinct — collapsing any two of these is the failure class', () => {
  it('an unsupported type is NOT reported as "no matching key"', () => {
    // Real case: chore/SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001-approved-by-header (PR #6664) is
    // outside the token set. It must be visibly unsupported, not silently unmatched — otherwise the
    // known coverage gap disappears into a number that looks like success.
    const r = resolveBranchOwner('chore/SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001-approved-by-header', ['SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001']);
    expect(r.owner).toBeNull();
    expect(r.reason).toBe(OWNER_REASON.UNSUPPORTED_BRANCH_TYPE);
    expect(r.reason).not.toBe(OWNER_REASON.NO_MATCHING_KEY);
  });

  it('malformed input is not reported as unmatched', () => {
    expect(resolveBranchOwner('', ['SD-A-001']).reason).toBe(OWNER_REASON.MALFORMED_BRANCH);
    expect(resolveBranchOwner('no-slash', ['SD-A-001']).reason).toBe(OWNER_REASON.MALFORMED_BRANCH);
  });
});

describe('loadKeySet fails CLOSED — the hazard the substrate change introduces', () => {
  // The naive handling is: key set fails to load → no keys → nothing matched → "no open PRs
  // found" → PASS. That is a NEW route into the exact fail-open this SD closes, so every failure
  // mode below must be ok:false and must NOT masquerade as an empty-but-valid key set.
  const expectFailClosed = (res) => {
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(OWNER_REASON.KEY_SET_UNAVAILABLE);
    expect(res.keys.size).toBe(0);
  };

  it('no client supplied', async () => {
    expectFailClosed(await loadKeySet(null));
    expectFailClosed(await loadKeySet({}));
  });

  it('query returns an error', async () => {
    const sb = { from: () => ({ select: async () => ({ data: null, error: { message: 'boom' } }) }) };
    const res = await loadKeySet(sb);
    expectFailClosed(res);
    expect(res.error).toContain('boom');
  });

  it('client throws', async () => {
    const sb = { from: () => { throw new Error('network down'); } };
    const res = await loadKeySet(sb);
    expectFailClosed(res);
    expect(res.error).toContain('network down');
  });

  // The subtle one. A successful query returning zero rows is NOT "no SDs exist" — it is a broken
  // read. Treating it as a valid empty set is precisely how a fail-open looks like a clean pass.
  it('an EMPTY result is unavailable, not an empty key set', async () => {
    const sb = { from: () => ({ select: async () => ({ data: [], error: null }) }) };
    expectFailClosed(await loadKeySet(sb));
  });

  it('a good load is ok and carries the keys', async () => {
    const sb = { from: () => ({ select: async () => ({ data: [{ sd_key: 'SD-A-001' }, { sd_key: 'SD-B-002' }], error: null }) }) };
    const res = await loadKeySet(sb);
    expect(res.ok).toBe(true);
    expect(res.keys.has('SD-A-001')).toBe(true);
    expect(res.keys.size).toBe(2);
  });

  // THE DISCRIMINATOR. "key set unavailable" and "this branch matches nothing" must be
  // distinguishable, because one must block the handoff and the other must not.
  it('KEY_SET_UNAVAILABLE is a different reason from NO_MATCHING_KEY', async () => {
    const unavailable = await loadKeySet(null);
    const unmatched = resolveBranchOwner('feat/SD-UNKNOWN-999', ['SD-A-001']);
    expect(unavailable.reason).toBe(OWNER_REASON.KEY_SET_UNAVAILABLE);
    expect(unmatched.reason).toBe(OWNER_REASON.NO_MATCHING_KEY);
    expect(unavailable.reason).not.toBe(unmatched.reason);
  });
});

describe('the tie-impossibility proof has a dependency, and it is asserted', () => {
  it('the shipped token set is prefix-free', () => {
    expect(assertTypeTokensPrefixFree()).toBe(true);
    expect(BRANCH_TYPE_TOKENS).toContain('test');
  });

  // Without this the proof could lapse silently: adding 'te' next to 'test' breaks the argument
  // that two matching keys share a type prefix, and nothing would complain.
  it('throws loudly if a token prefixes another', () => {
    expect(() => assertTypeTokensPrefixFree(['te', 'test', 'fix']))
      .toThrow(/prefix-free/);
  });
});
