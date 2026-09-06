/**
 * QF-20260903-177: the git tools used by the retrospective generator are read-only
 * (no repo mutation), so --dry-run has no reason to fabricate output. A prior fixture
 * returned hardcoded file paths (lib/programmatic/tool-loop.js, etc.) for EVERY dry
 * run regardless of the SD/branch being asked about — including when the real diff
 * would have been empty (branch already merged into main) — and a caller reported
 * those fabricated paths as real diff content.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let execSyncMock;

vi.mock('child_process', () => ({
  execSync: (...args) => execSyncMock(...args),
}));

async function importModule() {
  vi.resetModules();
  return import('../../../lib/programmatic/tools/git-tool.js');
}

describe('git-tool dry-run no longer fabricates content', () => {
  beforeEach(() => {
    execSyncMock = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('gitDiff.handler runs the real git command even when dryRun is true', async () => {
    execSyncMock.mockReturnValue('');
    const { createGitTools } = await importModule();
    const { gitDiff } = createGitTools('/repo');

    const result = await gitDiff.handler({ branch: 'feat/SD-X-001' }, { dryRun: true });

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock.mock.calls[0][0]).toContain('git -C "/repo" diff --stat');
    expect(result).not.toContain('lib/programmatic/tool-loop.js');
    expect(result).not.toContain('scripts/programmatic/vision-scorer.js');
  });

  it('changedFiles.handler runs the real git command even when dryRun is true, and an empty diff stays empty', async () => {
    execSyncMock.mockReturnValue('');
    const { createGitTools } = await importModule();
    const { changedFiles } = createGitTools('/repo');

    const result = await changedFiles.handler({ branch: 'feat/SD-X-001' }, { dryRun: true });

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result)).toEqual([]);
    expect(result).not.toContain('lib/programmatic/tool-loop.js');
    expect(result).not.toContain('supabase-tool.js');
  });

  it('changedFiles.handler passes through real (non-fabricated) files when the diff is non-empty', async () => {
    execSyncMock.mockReturnValue('lib/real-file-touched-by-this-sd.js\n');
    const { createGitTools } = await importModule();
    const { changedFiles } = createGitTools('/repo');

    const result = await changedFiles.handler({ branch: 'feat/SD-X-001' });

    expect(JSON.parse(result)).toEqual(['lib/real-file-touched-by-this-sd.js']);
  });
});

describe('retrospective-generator prompt no longer hardcodes a passing dry-run score', () => {
  it('does not instruct the model to always report quality_score: 75 on dry run', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../../scripts/programmatic/retrospective-generator.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/mock quality_score: 75/);
    expect(src).toMatch(/never a fixed placeholder score/);
  });

  it('instructs the model not to invent file paths when the git diff is empty', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../../scripts/programmatic/retrospective-generator.js', import.meta.url), 'utf8');
    expect(src).toMatch(/do NOT invent file\s*\n?\s*paths/);
  });
});
