/**
 * Tests for S20 QC repo analysis wiring
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-B-B
 *
 * Verifies that stage-21-quality-assurance.js integrates repo analysis
 * from github-repo-analyzer when available, with graceful fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockMaybeSingle = vi.fn();
const mockSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  }),
};

let silentLogger;

beforeEach(() => {
  vi.resetModules();
  silentLogger = { log: vi.fn(), warn: vi.fn() };
});

// Mock the github-repo-analyzer (dynamic import from source resolves to same absolute path)
vi.mock('../../../../lib/eva/bridge/github-repo-analyzer.js', () => ({
  analyzeRepo: vi.fn().mockResolvedValue({
    fileCount: 25,
    componentCount: 5,
    hasLandingPage: true,
    hasRoutes: true,
    componentScore: 80,
  }),
}));

// Also mock at the path the source file uses for dynamic import
vi.mock('../../../eva/bridge/github-repo-analyzer.js', () => ({
  analyzeRepo: vi.fn().mockResolvedValue({
    fileCount: 25,
    componentCount: 5,
    hasLandingPage: true,
    hasRoutes: true,
    componentScore: 80,
  }),
}));

const { analyzeStage21 } = await import(
  '../../../../lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js'
);

describe('S20 QC repo analysis wiring', () => {
  const makeStageWorkData = (opts = {}) => ({
    data: {
      advisory_data: {
        total_tasks: opts.total || 10,
        completed_tasks: opts.completed || 10,
        blocked_tasks: opts.blocked || 0,
        tasks: Array.from({ length: opts.total || 10 }, (_, i) => ({
          title: `Task ${i}`,
          status: i < (opts.completed || 10) ? 'done' : 'blocked',
        })),
        issues: [],
        repo_url: opts.repoUrl || null,
      },
    },
    error: null,
  });

  it('includes repo_analysis when repo URL available and analyzer works', async () => {
    const stageWork = makeStageWorkData({ repoUrl: 'https://github.com/test/repo' });
    mockMaybeSingle.mockResolvedValueOnce(stageWork);

    const result = await analyzeStage21({
      stage20Data: { tasks_completed: 10 },
      stage19Data: { dataSource: 'venture_stage_work' },
      ventureName: 'TestVenture',
      supabase: mockSupabase,
      ventureId: 'test-uuid',
      logger: silentLogger,
    });

    expect(result.repo_analysis).toBeDefined();
    expect(result.repo_analysis.fileCount).toBe(25);
    expect(result.repo_analysis.hasLandingPage).toBe(true);
    expect(result.repo_analysis.completenessScore).toBeGreaterThan(0);
  });

  it('returns null repo_analysis when no repo URL', async () => {
    const stageWork = makeStageWorkData({ repoUrl: null });
    mockMaybeSingle.mockResolvedValueOnce(stageWork);

    const result = await analyzeStage21({
      stage20Data: { tasks_completed: 10 },
      stage19Data: { dataSource: 'venture_stage_work' },
      ventureName: 'TestVenture',
      supabase: mockSupabase,
      ventureId: 'test-uuid',
      logger: silentLogger,
    });

    expect(result.repo_analysis).toBeNull();
    expect(result.overall_pass_rate).toBe(100);
  });

  it('factors repo completeness into quality decision', async () => {
    const stageWork = makeStageWorkData({ repoUrl: 'https://github.com/test/repo' });
    mockMaybeSingle.mockResolvedValueOnce(stageWork);

    const result = await analyzeStage21({
      stage20Data: { tasks_completed: 10 },
      stage19Data: { dataSource: 'venture_stage_work' },
      ventureName: 'TestVenture',
      supabase: mockSupabase,
      ventureId: 'test-uuid',
      logger: silentLogger,
    });

    // With 100% pass rate + repo analysis, should pass
    expect(result.qualityDecision.decision).toBe('pass');
    expect(result.qualityDecision.rationale).toContain('repo completeness');
  });

  it('quality gate still works without repo analysis', async () => {
    const stageWork = makeStageWorkData({ total: 10, completed: 10 });
    mockMaybeSingle.mockResolvedValueOnce(stageWork);

    const result = await analyzeStage21({
      stage20Data: { tasks_completed: 10 },
      stage19Data: { dataSource: 'venture_stage_work' },
      ventureName: 'TestVenture',
      supabase: mockSupabase,
      ventureId: 'test-uuid',
      logger: silentLogger,
    });

    expect(result.qualityDecision.decision).toBe('pass');
    expect(result.overall_pass_rate).toBe(100);
  });
});
