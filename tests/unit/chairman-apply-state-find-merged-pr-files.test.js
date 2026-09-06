// QF-20260906-048 — regression coverage for findMergedPrFileList, the real function (not
// module-mocked). RCA a6eefe27 found this function has NEVER returned a non-empty files[]
// since it shipped (SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001, 2026-08-29): it called
// loadKeySet() with no supabase client, then passed the resulting {ok:false, keys, ...}
// FAIL-ENVELOPE directly where branchBelongsToSd expects an iterable Set, throwing inside
// resolveBranchOwner. That throw escaped into the outer per-repo catch and was mislabeled
// "gh CLI error" even when gh worked perfectly.
//
// The discriminating assertion is the SUCCESS path: a non-null files[] AND error===null.
// Asserting only "error is non-null" passes on the broken code (every path returns an error);
// asserting only "error is null" passes on a broken-but-empty key set (a silent fail-open —
// see the second describe block). The fixture below is deliberately a NON-EMPTY PR list:
// Array.prototype.filter never invokes its callback on [], so an empty fixture would pass
// against the broken code for a second, independent wrong reason.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('../../lib/git/branch-owner.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadKeySet: vi.fn() };
});

const { execFileSync } = await import('child_process');
const { loadKeySet } = await import('../../lib/git/branch-owner.js');
const { findMergedPrFileList } = await import(
  '../../scripts/modules/handoff/executors/lead-final-approval/chairman-apply-state.js'
);

const FAKE_SUPABASE = { from: () => ({}) };
const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G';
const REPOS = [{ githubRepo: 'rickfelix/EHG_Engineer', localPath: '/repo' }];

beforeEach(() => {
  execFileSync.mockReset();
  loadKeySet.mockReset();
});

describe('findMergedPrFileList — success path (RCA a6eefe27, QF-20260906-048)', () => {
  it('resolves a non-empty file list when the key set is available and a merged PR matches', async () => {
    loadKeySet.mockResolvedValue({ ok: true, keys: new Set([SD_KEY, 'SD-OTHER-001']), reason: null, error: null });
    execFileSync
      // gh pr list --state merged --search <sdKey>
      .mockReturnValueOnce(JSON.stringify([
        { number: 8301, headRefName: `feat/${SD_KEY}` },
        { number: 9999, headRefName: 'feat/SD-OTHER-001' }, // must NOT be treated as this SD's PR
      ]))
      // gh pr view 8301 --json files
      .mockReturnValueOnce(JSON.stringify({ files: [{ path: 'database/migrations/x.sql' }, { path: 'lib/y.js' }] }));

    const result = await findMergedPrFileList(SD_KEY, REPOS, FAKE_SUPABASE);

    expect(result.error).toBeNull();
    expect(result.files).toEqual(['database/migrations/x.sql', 'lib/y.js']);
    expect(loadKeySet).toHaveBeenCalledWith(FAKE_SUPABASE);
  });

  it('does not throw and does not mislabel a real key-set unavailability as a gh CLI error', async () => {
    // Guards against the WRONG repair (silently defaulting to an empty Set): an unavailable key
    // set must surface as its own honest error, never masquerade as a gh-side failure, and must
    // never resolve as "found nothing" (error:null) — that would be the exact fail-open this
    // function's own docblock forbids.
    loadKeySet.mockResolvedValue({ ok: false, keys: new Set(), reason: 'KEY_SET_UNAVAILABLE', error: 'count failed: boom' });

    const result = await findMergedPrFileList(SD_KEY, REPOS, FAKE_SUPABASE);

    expect(result.files).toEqual([]);
    expect(result.error).toMatch(/key set unavailable/);
    expect(result.error).not.toMatch(/gh CLI/);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('never resolves the wrong PR as this SD’s own when a sibling branch also matches the search text', async () => {
    // gh's --search is a prose match, not a headRefName filter — branchBelongsToSd is what
    // narrows to the SD that actually owns the branch (RCA a6eefe27 sibling-key disambiguation).
    loadKeySet.mockResolvedValue({ ok: true, keys: new Set([SD_KEY]), reason: null, error: null });
    execFileSync.mockReturnValueOnce(JSON.stringify([
      { number: 1, headRefName: 'feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H' }, // sibling, must not match
    ]));

    const result = await findMergedPrFileList(SD_KEY, REPOS, FAKE_SUPABASE);

    expect(result.files).toEqual([]);
    expect(result.error).toBeNull();
    // Only the list call should fire; no PR view call for the non-owned sibling branch.
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });
});
