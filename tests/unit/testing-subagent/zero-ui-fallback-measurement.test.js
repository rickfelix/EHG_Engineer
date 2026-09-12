/**
 * QF-20260911-350
 *
 * checkForNonUISdType()'s zero-UI-by-diff gate failed closed unconditionally whenever the direct
 * diff range was unresolvable (cwdSharedRootRefused) or resolved empty (a squash-merged branch
 * where main...HEAD is empty by construction) -- three separate BLOCKED runs in one session for
 * genuinely zero-UI, already-merged SDs (SESSION-COORDINATION-INSERT-001, ADAM-DURABLE-DUTY-001,
 * FOUR-GATES-RETURNED-001).
 *
 * Fix: before failing closed, try a second measurement -- the SD's declared
 * metadata.files_to_modify, else the merged PR's actual file list (findMergedPrFileList) --
 * classified against the same UI-surface globs the direct diff already uses. Only when BOTH the
 * direct diff and this fallback are unavailable does the gate fail closed, now with a non-empty
 * `summary` naming which measurements failed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('node:child_process', () => ({ execSync: (...args) => execSyncMock(...args) }));
vi.mock('../../../scripts/modules/complete-quick-fix/test-runner.js', () => ({
  runTests: vi.fn(() => ({ passed: true, summary: { passed: 2, failed: 0, skipped: 0, total: 2 } }))
}));

const findMergedPrFileListMock = vi.fn();
vi.mock('../../../scripts/modules/handoff/executors/lead-final-approval/chairman-apply-state.js', () => ({
  findMergedPrFileList: (...args) => findMergedPrFileListMock(...args)
}));
vi.mock('../../../lib/sub-agents/repo-target-resolver.js', () => ({
  computeReposForSD: () => [{ githubRepo: 'rickfelix/EHG_Engineer', localPath: '/repo' }]
}));

const { checkForNonUISdType, resolveFallbackNonUiFiles } = await import('../../../lib/sub-agents/testing/index.js');

function mockSupabase(sdRow) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          single: vi.fn(async () => ({ data: sdRow, error: null }))
        }))
      }))
    }))
  };
}

const bugfixSd = (overrides = {}) => ({
  sd_type: 'bugfix',
  category: null,
  key_changes: [{ change: 'modify lib/fleet/claim-eligibility.cjs to add setHold()' }],
  scope: '',
  title: 'x',
  sd_key: 'SD-FIXTURE-001',
  target_application: 'EHG_Engineer',
  metadata: {},
  ...overrides,
});

beforeEach(() => {
  execSyncMock.mockReset();
  findMergedPrFileListMock.mockReset();
});

describe('resolveFallbackNonUiFiles (unit)', () => {
  it('prefers metadata.files_to_modify over the merged-PR fallback when both would resolve', async () => {
    const result = await resolveFallbackNonUiFiles('SD-X', bugfixSd({ metadata: { files_to_modify: ['lib/foo.js'] } }), {});
    expect(result).toEqual({ files: ['lib/foo.js'], source: 'files_to_modify' });
    expect(findMergedPrFileListMock).not.toHaveBeenCalled();
  });

  it('falls back to the merged PR file list when metadata.files_to_modify is absent', async () => {
    findMergedPrFileListMock.mockResolvedValue({ files: ['lib/bar.mjs'], error: null });
    const result = await resolveFallbackNonUiFiles('SD-X', bugfixSd(), {});
    expect(result).toEqual({ files: ['lib/bar.mjs'], source: 'merged_pr_file_list' });
  });

  it('returns files:null when both are unavailable', async () => {
    findMergedPrFileListMock.mockResolvedValue({ files: [], error: 'gh CLI error' });
    const result = await resolveFallbackNonUiFiles('SD-X', bugfixSd(), {});
    expect(result).toEqual({ files: null, source: null });
  });
});

describe('checkForNonUISdType — zero-UI fallback measurement (QF-20260911-350)', () => {
  it('cwd-shared-root-refused (unresolvable diff range) + a *.mjs-only merged PR file list -> scoped non-UI path, not BLOCKED', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'main';
      throw new Error(`unexpected execSync call (diff should never run): ${cmd}`);
    });
    findMergedPrFileListMock.mockResolvedValue({ files: ['scripts/one-off/foo.mjs'], error: null });
    const sb = mockSupabase(bugfixSd());
    const result = await checkForNonUISdType(
      'sd-shared-root-no-branch', 'prospective', {}, { repoPath: '/shared-root' }, sb
    );
    expect(result.verdict).not.toBe('BLOCKED');
    expect(result.detailed_analysis.applicability_source).toBe('merged_pr_file_list');
    expect(result.metadata.zero_ui_source).toBe('merged_pr_file_list');
  });

  it('cwd-shared-root-refused + a merged PR file list containing a *.tsx file -> still fails closed to BLOCKED (UI-touching, not exempted)', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'main';
      throw new Error(`unexpected execSync call (diff should never run): ${cmd}`);
    });
    findMergedPrFileListMock.mockResolvedValue({ files: ['src/components/Widget.tsx'], error: null });
    const sb = mockSupabase(bugfixSd());
    const result = await checkForNonUISdType(
      'sd-shared-root-no-branch', 'prospective', {}, { repoPath: '/shared-root' }, sb
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(result.detailed_analysis.applicability_rule).toBe('cwd_shared_root_refused');
  });

  it('cwd-shared-root-refused + BOTH fallbacks unavailable -> fails closed with a non-empty summary naming both failed measurements', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'main';
      throw new Error(`unexpected execSync call: ${cmd}`);
    });
    findMergedPrFileListMock.mockResolvedValue({ files: [], error: 'gh CLI error' });
    const sb = mockSupabase(bugfixSd());
    const result = await checkForNonUISdType(
      'sd-shared-root-no-branch', 'prospective', {}, { repoPath: '/shared-root' }, sb
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/diff range unresolvable/i);
    expect(result.summary).toMatch(/fallback/i);
  });

  it('a resolvable-but-empty direct diff (squash-merged main...HEAD) falls back to files_to_modify and routes to the scoped non-UI path', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'feat/sd-fixture';
      if (cmd === 'git diff --name-only main...HEAD') return ''; // empty, not thrown -- squash-merged shape
      throw new Error(`unexpected execSync call: ${cmd}`);
    });
    const sb = mockSupabase(bugfixSd({ metadata: { files_to_modify: ['lib/quality/burst-detector.js'] } }));
    const result = await checkForNonUISdType(
      'sd-squash-merged', 'retrospective', {}, { repoPath: '/repo' }, sb
    );
    expect(result.verdict).not.toBe('BLOCKED');
    expect(result.detailed_analysis.applicability_source).toBe('files_to_modify');
    expect(findMergedPrFileListMock).not.toHaveBeenCalled();
  });
});
