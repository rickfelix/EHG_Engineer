/**
 * QF-20260508-853: design-agent diff-based early-return for backend-only SDs.
 *
 * Pattern: 3rd witness (POST-LAUNCH-002, LAUNCH-READINESS-001, LIVE-ANNOUNCE-001) of
 * design-agent BLOCKED at EXEC-TO-PLAN for backend-only feature SDs that the existing
 * sd_type-based check did not catch (sd_type='feature', not 'infrastructure'). Each
 * witness consumed 1/3 bypass quota.
 *
 * Fix: a separate diff-based check (checkForNonUIDiff) that early-returns PASS when
 * `git diff --name-only origin/main..HEAD` contains zero UI extensions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub execSync at module load
const execSyncMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execSync: execSyncMock }));

// Stub the supabase client + dotenv to avoid network/env requirements at import time
vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({})),
}));

// Stub the heavy DESIGN modules so import succeeds without their transitive deps
vi.mock('../../../lib/sub-agents/design/utils.js', () => ({
  enhanceWithRiskContext: vi.fn(),
  validateUxContractCompliance: vi.fn(),
  parseBaselineWorkflow: vi.fn(),
}));
vi.mock('../../../lib/sub-agents/design/checks.js', () => ({
  checkDesignSystem: vi.fn(),
  analyzeComponents: vi.fn(),
  checkAccessibility: vi.fn(),
  checkResponsiveDesign: vi.fn(),
  checkDesignConsistency: vi.fn(),
  generateRecommendations: vi.fn(),
}));
vi.mock('../../../lib/sub-agents/design/workflow-analyzer.js', () => ({
  workflowReviewCapability: vi.fn(),
}));
vi.mock('../../../lib/repo-paths.js', () => ({
  resolveRepoPath: vi.fn(() => '/fake/repo'),
}));

const { checkForNonUIDiff } = await import('../../../lib/sub-agents/design/index.js');

describe('QF-20260508-853 — design-agent diff-based early-return for backend-only SDs', () => {
  beforeEach(() => {
    execSyncMock.mockReset();
  });

  it('returns PASS when diff contains only backend files (.js/.sql/.cjs)', () => {
    execSyncMock.mockReturnValue([
      'lib/eva/artifact-types.js',
      'lib/eva/lifecycle/exit-gate-verifiers.js',
      'database/migrations/20260507_add_launch_metrics.sql',
      'tests/unit/eva/stage-templates/stage-24-routing.test.js',
    ].join('\n'));

    const result = checkForNonUIDiff({ repo_path: '/fake/repo' });

    expect(result).not.toBeNull();
    expect(result.verdict).toBe('PASS');
    expect(result.confidence).toBe(90);
    expect(result.detailed_analysis.skip_reason).toBe('backend_only_diff');
    expect(result.detailed_analysis.files_changed).toBe(4);
    expect(result.detailed_analysis.ui_files_changed).toBe(0);
  });

  it('returns null (full validation) when diff contains a .tsx file', () => {
    execSyncMock.mockReturnValue([
      'src/components/MyComponent.tsx',
      'lib/utils.js',
    ].join('\n'));

    const result = checkForNonUIDiff({ repo_path: '/fake/repo' });
    expect(result).toBeNull();
  });

  it('returns null (full validation) when diff contains a .jsx file', () => {
    execSyncMock.mockReturnValue([
      'src/components/Old.jsx',
    ].join('\n'));

    const result = checkForNonUIDiff({ repo_path: '/fake/repo' });
    expect(result).toBeNull();
  });

  it('returns null (full validation) when diff contains a .css/.scss/.html file', () => {
    for (const filename of ['styles/main.css', 'styles/_vars.scss', 'public/index.html']) {
      execSyncMock.mockReset();
      execSyncMock.mockReturnValueOnce(filename);
      const result = checkForNonUIDiff({ repo_path: '/fake/repo' });
      expect(result).toBeNull();
    }
  });

  it('returns null (full validation) when diff is empty (no commits past origin/main)', () => {
    execSyncMock.mockReturnValue('');
    const result = checkForNonUIDiff({ repo_path: '/fake/repo' });
    expect(result).toBeNull();
  });

  it('returns null (graceful fallback) when git diff command throws', () => {
    execSyncMock.mockImplementation(() => { throw new Error('not a git repo'); });
    const result = checkForNonUIDiff({ repo_path: '/fake/repo' });
    expect(result).toBeNull();
  });

  it('honors options.diff_base_ref override (custom base branch)', () => {
    execSyncMock.mockReturnValue('lib/foo.js');
    checkForNonUIDiff({ repo_path: '/fake/repo', diff_base_ref: 'origin/develop' });
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('origin/develop..HEAD'),
      expect.any(Object),
    );
  });

  it('case-insensitive UI-extension match (.TSX / .HTM)', () => {
    execSyncMock.mockReturnValue('src/Old.TSX');
    expect(checkForNonUIDiff({ repo_path: '/fake/repo' })).toBeNull();

    execSyncMock.mockReset();
    execSyncMock.mockReturnValue('public/page.HTM');
    expect(checkForNonUIDiff({ repo_path: '/fake/repo' })).toBeNull();
  });

  it('strips trailing whitespace and ignores empty lines in diff output', () => {
    execSyncMock.mockReturnValue('lib/foo.js  \n\n  lib/bar.js  \n  \n');
    const result = checkForNonUIDiff({ repo_path: '/fake/repo' });
    expect(result).not.toBeNull();
    expect(result.detailed_analysis.files_changed).toBe(2);
  });

  it('return shape matches existing checkForNonUISdType findings contract', () => {
    execSyncMock.mockReturnValue('lib/foo.js');
    const result = checkForNonUIDiff({ repo_path: '/fake/repo' });
    expect(result.findings).toEqual(expect.objectContaining({
      design_system_check: expect.objectContaining({ skipped: true }),
      component_analysis: expect.objectContaining({ skipped: true }),
      accessibility_check: expect.objectContaining({ skipped: true }),
      responsive_check: expect.objectContaining({ skipped: true }),
      consistency_check: expect.objectContaining({ skipped: true }),
    }));
  });
});
