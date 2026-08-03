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

/**
 * Supabase stub that behaves like PostgREST: an exact-count head request, then paged .range()
 * reads. `capPages` simulates the real failure — the server reports N rows but hands back only the
 * first page, which is exactly what a plain .select() does at the 1000-row cap.
 */
function pagedSb({ total, capPages = Infinity, pageSize = 1000, overlap = false }) {
  let pagesServed = 0;
  const ranged = {
    // .order() is part of the real call shape now — fetchAllPaginated is handed an ordered query.
    // The stub models it because a stub that accepts a call the code does not make (or refuses one
    // it does) tests a different function than the one that ships.
    order: () => ranged,
    range: async (from, to) => {
      if (pagesServed >= capPages) return { data: [], error: null };
      pagesServed += 1;
      // overlap: the first two pages return the SAME rows, then the read ends. This is the
      // unordered-pagination failure — a HOT-updated row shifts between pages, so one page repeats
      // rows another already returned. Row TOTAL comes out right; distinct keys come up short.
      //
      // It must TERMINATE. An overlap stub that serves full pages forever trips
      // fetchAllPaginated's own "query builder likely ignores .range()" guard first — a correct
      // refusal, but a different one, and the test would then be exercising the helper's guard
      // rather than the key-count check it names.
      if (overlap) {
        if (pagesServed > 2) return { data: [], error: null };
        const data = [];
        for (let i = 0; i < Math.min(pageSize, total); i += 1) data.push({ sd_key: `SD-KEY-${i}` });
        return { data, error: null };
      }
      const end = Math.min(to, total - 1);
      const data = [];
      for (let i = from; i <= end; i += 1) data.push({ sd_key: `SD-KEY-${i}` });
      return { data, error: null };
    },
  };
  return {
    from: () => ({
      select: (_cols, opts) => (opts && opts.head
        ? Promise.resolve({ count: total, error: null })
        : ranged),
    }),
  };
}

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
    const ranged = { order: () => ranged, range: async () => ({ data: null, error: { message: 'boom' } }) };
    const sb = { from: () => ({ select: (_c,o) => (o&&o.head ? Promise.resolve({count:5,error:null}) : ranged) }) };
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
    const sb = pagedSb({ total: 0 });
    expectFailClosed(await loadKeySet(sb));
  });

  it('a good load is ok and carries the keys', async () => {
    const res = await loadKeySet(pagedSb({ total: 2 }));
    expect(res.ok).toBe(true);
    expect(res.keys.has('SD-KEY-0')).toBe(true);
    expect(res.keys.size).toBe(2);
  });

  // ── THE TRUNCATION REGRESSION. This shipped, and it was worse than the bug it replaced. ──────
  // The first version of loadKeySet was a plain .select('sd_key'). PostgREST silently caps that at
  // 1000 rows. Measured against live data: 1000 of 5536 keys, ok:true, looking healthy — so 82% of
  // SDs resolved to NO_MATCHING_KEY, their branches were invisible, and the gate PASSED. The unit
  // tests at the time used 1-3 key sets and could not have caught it; a scan against real data did.
  it('pages past the 1000-row cap and returns the FULL key set', async () => {
    const res = await loadKeySet(pagedSb({ total: 2500 }));
    expect(res.ok).toBe(true);
    expect(res.keys.size).toBe(2500);
    // The specific failure: keys beyond the first page were absent entirely.
    expect(res.keys.has('SD-KEY-2499')).toBe(true);
  });

  it('a TRUNCATED read is unavailable, not a smaller key set', async () => {
    // The server reports 5000 rows but only ever hands back one page. Silently accepting that is
    // precisely the fail-open: a real branch resolves to "no matching key", which the gate reads as
    // "no open PRs" and passes.
    const res = await loadKeySet(pagedSb({ total: 5000, capPages: 1 }));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(OWNER_REASON.KEY_SET_UNAVAILABLE);
    expect(res.error).toMatch(/INCOMPLETE/);
    expect(res.error).toMatch(/1000 distinct keys for 5000 rows/);
  });

  // PAGE OVERLAP — the defect the FIRST paged version still had, found by the TESTING sub-agent.
  // Postgres guarantees no cross-statement row order and this table mutates continuously, so
  // unordered .range() paging can return a row twice and miss another. The row TOTAL stays correct,
  // which is why the original rows-fetched-vs-count check could not see it: the guard covered the
  // total-failure end of the axis while partial-but-plausible passed.
  it('detects page OVERLAP, where rows fetched looks correct but keys are short', async () => {
    const res = await loadKeySet(pagedSb({ total: 2000, overlap: true }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/1000 distinct keys for 2000 rows/);
  });

  it('a failing count fails closed — completeness cannot be verified without it', async () => {
    const sb = {
      from: () => ({
        select: (_c, opts) => (opts && opts.head
          ? Promise.resolve({ count: null, error: { message: 'count blew up' } })
          : { range: async () => ({ data: [], error: null }) }),
      }),
    };
    const res = await loadKeySet(sb);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/count failed/);
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
