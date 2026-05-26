/**
 * SD-LEO-INFRA-CROSS-REPO-AWARE-001 — DESIGN cross-repo repo resolution.
 *
 * The DESIGN sub-agent used to scan cwd / a hardcoded 'ehg' instead of the SD's
 * target_application repo, producing a silent always-green false-negative for every
 * cross-repo UI SD (RCA-DESIGN-ANALYSIS-CROSS-REPO-CWD-001). These tests cover the two
 * pure helpers that fix it (resolveDesignRepo, applyRepoResolutionVerdict) plus the
 * target_application threading in checkForNonUIDiff.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub execSync at module load (mirrors design-backend-only-diff.test.js).
const execSyncMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execSync: execSyncMock }));

// Override fs.existsSync while keeping the rest of fs real (dotenv.config needs readFileSync).
const existsSyncMock = vi.hoisted(() => vi.fn());
vi.mock('fs', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    default: { ...actual.default, existsSync: existsSyncMock },
    existsSync: existsSyncMock,
  };
});

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({})),
}));
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

const resolveRepoPathMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/repo-paths.js', () => ({
  resolveRepoPath: resolveRepoPathMock,
}));

const { resolveDesignRepo, applyRepoResolutionVerdict, checkForNonUIDiff } =
  await import('../../../lib/sub-agents/design/index.js');

describe('SD-LEO-INFRA-CROSS-REPO-AWARE-001 — DESIGN cross-repo repo resolution', () => {
  beforeEach(() => {
    execSyncMock.mockReset();
    existsSyncMock.mockReset();
    resolveRepoPathMock.mockReset();
  });

  describe('resolveDesignRepo (FR-1/FR-2)', () => {
    it('TS-2: derives the repo from target_application, not a hardcoded ehg', () => {
      resolveRepoPathMock.mockImplementation((app) => (app === 'EHG' ? 'C:/x/ehg' : null));
      existsSyncMock.mockReturnValue(true);

      const r = resolveDesignRepo({ target_application: 'EHG' });

      expect(resolveRepoPathMock).toHaveBeenCalledWith('EHG');
      expect(r.resolvedRepoPath).toBe('C:/x/ehg');
      expect(r.repoResolved).toBe(true);
      expect(r.componentsDirExists).toBe(true);
    });

    it('prefers an explicit options.repo_path over target_application resolution', () => {
      existsSyncMock.mockReturnValue(true);

      const r = resolveDesignRepo({ repo_path: 'C:/explicit/path', target_application: 'EHG' });

      expect(r.resolvedRepoPath).toBe('C:/explicit/path');
      expect(resolveRepoPathMock).not.toHaveBeenCalled();
    });

    it('TS-4 (R3, HIGH): an unresolvable target_application yields repo_resolved=false, never a silent cwd pass', () => {
      resolveRepoPathMock.mockReturnValue(null); // registry/DB miss

      const r = resolveDesignRepo({ target_application: 'UnknownVenture' });

      expect(r.repoResolved).toBe(false);
      expect(r.componentsDirExists).toBe(false);
      // repoPath still falls back to cwd as a last-ditch scan root, but repoResolved records the miss.
      expect(r.repoPath).toBe(process.cwd());
    });

    it('reports components_dir_exists=false when the resolved repo has no src/components (wrong repo)', () => {
      resolveRepoPathMock.mockReturnValue('C:/x/EHG_Engineer');
      existsSyncMock.mockReturnValue(false);

      const r = resolveDesignRepo({ target_application: 'EHG_Engineer' });

      expect(r.repoResolved).toBe(true);
      expect(r.componentsDirExists).toBe(false);
    });
  });

  describe('applyRepoResolutionVerdict (FR-2 fail-closed)', () => {
    it('TS-3: attaches the metadata contract on a resolved repo and keeps PASS', () => {
      const results = { verdict: 'PASS', confidence: 100, warnings: [] };

      applyRepoResolutionVerdict(results, { resolvedRepoPath: 'C:/x/ehg', repoResolved: true, componentsDirExists: true });

      expect(results.metadata).toEqual({ repo_path: 'C:/x/ehg', repo_resolved: true, components_dir_exists: true });
      expect(results.verdict).toBe('PASS');
      expect(results.warnings).toHaveLength(0);
    });

    it('TS-4: downgrades PASS to CONDITIONAL_PASS when repo is unresolved', () => {
      const results = { verdict: 'PASS', confidence: 100, warnings: [] };

      applyRepoResolutionVerdict(results, { resolvedRepoPath: null, repoResolved: false, componentsDirExists: false });

      expect(results.verdict).toBe('CONDITIONAL_PASS');
      expect(results.confidence).toBeLessThanOrEqual(60);
      expect(results.warnings).toHaveLength(1);
      expect(results.metadata.repo_resolved).toBe(false);
    });

    it('downgrades PASS when the components dir is missing (scanned the wrong repo)', () => {
      const results = { verdict: 'PASS', confidence: 100, warnings: [] };

      applyRepoResolutionVerdict(results, { resolvedRepoPath: 'C:/x/EHG_Engineer', repoResolved: true, componentsDirExists: false });

      expect(results.verdict).toBe('CONDITIONAL_PASS');
    });

    it('does not weaken a stronger BLOCKED verdict', () => {
      const results = { verdict: 'BLOCKED', confidence: 30, warnings: [] };

      applyRepoResolutionVerdict(results, { resolvedRepoPath: null, repoResolved: false, componentsDirExists: false });

      expect(results.verdict).toBe('BLOCKED');
    });
  });

  describe('checkForNonUIDiff (FR-1 + metadata)', () => {
    it('TS-B: resolves the diff repo from target_application when no repo_path is given', () => {
      resolveRepoPathMock.mockImplementation((app) => (app === 'EHG' ? 'C:/x/ehg' : null));
      execSyncMock.mockReturnValue('lib/foo.js\nscripts/bar.cjs');

      const result = checkForNonUIDiff({ target_application: 'EHG' });

      expect(resolveRepoPathMock).toHaveBeenCalledWith('EHG');
      expect(execSyncMock.mock.calls[0][1].cwd).toBe('C:/x/ehg');
      expect(result).not.toBeNull();
      expect(result.verdict).toBe('PASS');
      expect(result.metadata).toEqual(
        expect.objectContaining({
          repo_path: 'C:/x/ehg',
          repo_resolved: true,
          components_dir_exists: true,
          skip_reason: 'backend_only_diff',
        })
      );
    });
  });
});
