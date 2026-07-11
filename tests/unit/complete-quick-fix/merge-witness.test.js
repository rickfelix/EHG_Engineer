/**
 * QF merge-verification witness unit tests
 * SD-LEO-INFRA-QF-FALSE-COMPLETION-WITNESS-GAP-001
 *
 * A quick_fixes row must not reach status=completed while its change is absent from origin/main.
 * verifyQFMergeWitness requires the QF's OWN qf/<QF-ID> branch to have a MERGED PR whose merge
 * commit is reachable from origin/main; it self-derives the PR from the own branch (never a
 * foreign/most-recent merged pr_url) and fails CLOSED.
 *
 * Only the subprocess boundary (child_process.execSync) is mocked — the REAL fetchPRMetadata +
 * reachability logic run against it, dispatched by command string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const {
  verifyQFMergeWitness,
  deriveOwnPr,
  isReachableFromMain,
  ownBranchFor,
  ownBranchCandidatesFor,
  QF_MERGE_UNVERIFIED,
} = await import('../../../scripts/modules/complete-quick-fix/merge-witness.js');

const TEST_DIR = '/repo';
const REACHABLE_SHA = 'a1b2c3d4e5f6789012345678901234567890abcd';

/**
 * Build an execSync mock that dispatches by command string.
 * @param {object} cfg
 *  - prView: JSON object returned for `gh pr view <n>` (or (cmd)=>obj), or Error to throw
 *  - prList: array returned for `gh pr list --head ...`, or Error to throw
 *  - reachable: whether `git merge-base --is-ancestor` succeeds (default true)
 */
function mockExec({ prView, prList, reachable = true } = {}) {
  execSync.mockImplementation((cmd) => {
    if (cmd.includes('gh pr view')) {
      if (prView instanceof Error) throw prView;
      if (prView === undefined) throw new Error('gh pr view not stubbed');
      return JSON.stringify(typeof prView === 'function' ? prView(cmd) : prView);
    }
    if (cmd.includes('gh pr list')) {
      if (prList instanceof Error) throw prList;
      return JSON.stringify(prList || []);
    }
    if (cmd.includes('git fetch')) return '';
    if (cmd.includes('merge-base --is-ancestor')) {
      if (reachable) return '';
      const e = new Error('not an ancestor');
      e.status = 1;
      throw e;
    }
    return '';
  });
}

const OWN = (qfId, over = {}) => ({
  state: 'MERGED',
  headRefName: ownBranchFor(qfId),
  mergeCommit: { oid: REACHABLE_SHA },
  url: 'https://github.com/rickfelix/EHG_Engineer/pull/6001',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ownBranchFor', () => {
  it('is qf/<QF-ID>', () => {
    expect(ownBranchFor('QF-20260701-989')).toBe('qf/QF-20260701-989');
  });
});

describe('isReachableFromMain', () => {
  it('true when merge-base --is-ancestor exits 0', () => {
    mockExec({ reachable: true });
    expect(isReachableFromMain(REACHABLE_SHA, TEST_DIR)).toBe(true);
  });
  it('false (fail-closed) when merge-base exits non-zero', () => {
    mockExec({ reachable: false });
    expect(isReachableFromMain(REACHABLE_SHA, TEST_DIR)).toBe(false);
  });
  it('false for an empty sha', () => {
    mockExec({ reachable: true });
    expect(isReachableFromMain(null, TEST_DIR)).toBe(false);
  });
});

describe('deriveOwnPr', () => {
  it('returns the PR whose head is qf/<QF-ID>', () => {
    mockExec({ prList: [OWN('QF-A-001')] });
    const pr = deriveOwnPr('QF-A-001', TEST_DIR);
    expect(pr).not.toBeNull();
    expect(pr.headRefName).toBe('qf/QF-A-001');
  });
  it('returns null (fail-closed) when gh errors', () => {
    mockExec({ prList: new Error('gh not authed') });
    expect(deriveOwnPr('QF-A-001', TEST_DIR)).toBeNull();
  });
  it('returns null when no PR matches the own branch', () => {
    mockExec({ prList: [] });
    expect(deriveOwnPr('QF-A-001', TEST_DIR)).toBeNull();
  });
});

describe('verifyQFMergeWitness — blocking (unverified) cases', () => {
  it('TS-1: foreign merged pr_url (head != qf/<QF-ID>) and no own PR → QF_MERGE_UNVERIFIED', () => {
    // pr_url resolves to a foreign MERGED PR; own-branch gh pr list is empty.
    mockExec({
      prView: { state: 'MERGED', headRefName: 'feat/some-other-sd', mergeCommit: { oid: REACHABLE_SHA }, url: 'https://github.com/rickfelix/EHG_Engineer/pull/5290' },
      prList: [],
    });
    const w = verifyQFMergeWitness({ qfId: 'QF-20260701-989', prUrl: 'https://github.com/rickfelix/EHG_Engineer/pull/5290', testDir: TEST_DIR });
    expect(w.verified).toBe(false);
    expect(w.code).toBe(QF_MERGE_UNVERIFIED);
    expect(w.reason).toMatch(/qf\/QF-20260701-989/);
  });

  it('TS-2: own branch has no PR (unpushed) → QF_MERGE_UNVERIFIED', () => {
    mockExec({ prList: [] });
    const w = verifyQFMergeWitness({ qfId: 'QF-B-001', prUrl: undefined, testDir: TEST_DIR });
    expect(w.verified).toBe(false);
    expect(w.code).toBe(QF_MERGE_UNVERIFIED);
  });

  it('TS-3: own PR exists but state=OPEN (unmerged) → QF_MERGE_UNVERIFIED', () => {
    const url = 'https://github.com/rickfelix/EHG_Engineer/pull/6100';
    mockExec({ prView: OWN('QF-C-001', { state: 'OPEN', url }) });
    const w = verifyQFMergeWitness({ qfId: 'QF-C-001', prUrl: url, testDir: TEST_DIR });
    expect(w.verified).toBe(false);
    expect(w.code).toBe(QF_MERGE_UNVERIFIED);
    expect(w.reason).toMatch(/OPEN/);
  });

  it('TS-4: own PR MERGED but merge commit NOT reachable from origin/main → QF_MERGE_UNVERIFIED', () => {
    const url = 'https://github.com/rickfelix/EHG_Engineer/pull/6200';
    mockExec({ prView: OWN('QF-D-001', { url }), reachable: false });
    const w = verifyQFMergeWitness({ qfId: 'QF-D-001', prUrl: url, testDir: TEST_DIR });
    expect(w.verified).toBe(false);
    expect(w.code).toBe(QF_MERGE_UNVERIFIED);
    expect(w.reason).toMatch(/reachable from origin\/main/);
  });
});

describe('verifyQFMergeWitness — verified (completable) cases', () => {
  it('TS-5: own qf/<QF-ID> PR MERGED + reachable → verified with self-derived pr_url', () => {
    const url = 'https://github.com/rickfelix/EHG_Engineer/pull/6300';
    mockExec({ prView: OWN('QF-E-001', { url }), reachable: true });
    const w = verifyQFMergeWitness({ qfId: 'QF-E-001', prUrl: url, testDir: TEST_DIR });
    expect(w.verified).toBe(true);
    expect(w.code).toBeNull();
    expect(w.prUrl).toBe(url);
    expect(w.headBranch).toBe('qf/QF-E-001');
    expect(w.mergeSha).toBe(REACHABLE_SHA);
  });

  it('TS-6: no pr_url but own branch has a MERGED+reachable PR (self-derived) → verified', () => {
    const own = OWN('QF-F-001', { url: 'https://github.com/rickfelix/EHG_Engineer/pull/6400' });
    mockExec({ prList: [own], reachable: true });
    const w = verifyQFMergeWitness({ qfId: 'QF-F-001', prUrl: undefined, testDir: TEST_DIR });
    expect(w.verified).toBe(true);
    expect(w.prUrl).toBe(own.url);
  });

  it('falls through to self-derive when the supplied pr_url is UNRESOLVABLE (gh view errors)', () => {
    const own = OWN('QF-H-001', { url: 'https://github.com/rickfelix/EHG_Engineer/pull/6600' });
    mockExec({
      prView: new Error('gh pr view 404: not found'), // supplied pr_url cannot be resolved
      prList: [own],                                   // ...but the own branch has a merged PR
      reachable: true,
    });
    const w = verifyQFMergeWitness({ qfId: 'QF-H-001', prUrl: 'https://github.com/rickfelix/EHG_Engineer/pull/404', testDir: TEST_DIR });
    expect(w.verified).toBe(true);
    expect(w.prUrl).toBe(own.url);
  });

  it('self-derives the OWN PR even when a FOREIGN merged pr_url is supplied (never trusts the foreign PR)', () => {
    const own = OWN('QF-G-001', { url: 'https://github.com/rickfelix/EHG_Engineer/pull/6500' });
    mockExec({
      // supplied pr_url is a foreign merged PR...
      prView: { state: 'MERGED', headRefName: 'feat/foreign', mergeCommit: { oid: REACHABLE_SHA }, url: 'https://github.com/rickfelix/EHG_Engineer/pull/5290' },
      // ...but the QF's OWN branch does have a legitimately merged PR.
      prList: [own],
      reachable: true,
    });
    const w = verifyQFMergeWitness({ qfId: 'QF-G-001', prUrl: 'https://github.com/rickfelix/EHG_Engineer/pull/5290', testDir: TEST_DIR });
    expect(w.verified).toBe(true);
    expect(w.prUrl).toBe(own.url); // self-derived, NOT the foreign #5290
    expect(w.headBranch).toBe('qf/QF-G-001');
  });
});

describe('ownBranchCandidatesFor (QF-20260711-959: tolerate resolve-sd-workdir.js naming)', () => {
  it('lists qf/, feat/, fix/ candidates with the canonical qf/ name first', () => {
    expect(ownBranchCandidatesFor('QF-Z-001')).toEqual(['qf/QF-Z-001', 'feat/QF-Z-001', 'fix/QF-Z-001']);
  });

  it('deriveOwnPr matches a PR whose head is feat/<QF-ID> (resolve-sd-workdir.js naming)', () => {
    const own = OWN('QF-Z-002', { headRefName: 'feat/QF-Z-002' });
    mockExec({ prList: [own] });
    const pr = deriveOwnPr('QF-Z-002', TEST_DIR);
    expect(pr).not.toBeNull();
    expect(pr.headRefName).toBe('feat/QF-Z-002');
  });

  it('verifyQFMergeWitness verifies a MERGED PR whose head is feat/<QF-ID>, not just qf/<QF-ID>', () => {
    const own = OWN('QF-Z-003', { headRefName: 'feat/QF-Z-003', url: 'https://github.com/rickfelix/EHG_Engineer/pull/6700' });
    mockExec({ prList: [own], reachable: true });
    const w = verifyQFMergeWitness({ qfId: 'QF-Z-003', prUrl: undefined, testDir: TEST_DIR });
    expect(w.verified).toBe(true);
    expect(w.headBranch).toBe('feat/QF-Z-003');
    expect(w.prUrl).toBe(own.url);
  });

  it('still refuses a branch outside the enumerated candidate set (e.g. docs/<QF-ID>) — no loosening', () => {
    const foreignPrefixed = OWN('QF-Z-004', { headRefName: 'docs/QF-Z-004' });
    mockExec({ prList: [foreignPrefixed] });
    const w = verifyQFMergeWitness({ qfId: 'QF-Z-004', prUrl: undefined, testDir: TEST_DIR });
    expect(w.verified).toBe(false);
    expect(w.code).toBe(QF_MERGE_UNVERIFIED);
  });
});

describe('QF-20260701-989 regression (the exact false-completion shape)', () => {
  it('foreign merged pr_url (#5290) + own branch never pushed → BLOCKED (not completable)', () => {
    mockExec({
      prView: { state: 'MERGED', headRefName: 'feat/SD-LEO-INFRA-CONVERGENCE-BUILDTREE-CHILDREN-UNMARKED-001', mergeCommit: { oid: REACHABLE_SHA }, url: 'https://github.com/rickfelix/EHG_Engineer/pull/5290' },
      prList: [], // qf/QF-20260701-989 does not exist on origin
    });
    const w = verifyQFMergeWitness({ qfId: 'QF-20260701-989', prUrl: 'https://github.com/rickfelix/EHG_Engineer/pull/5290', testDir: TEST_DIR });
    expect(w.verified).toBe(false);
    expect(w.code).toBe(QF_MERGE_UNVERIFIED);
  });
});
