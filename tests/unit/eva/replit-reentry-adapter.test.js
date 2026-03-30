import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  upsert: mockUpsert,
}));
mockSelect.mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: { name: 'TestVenture' }, error: null }),
  }),
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const { importReplitBuild } = await import('../../../lib/eva/bridge/replit-reentry-adapter.js');

describe('Replit Re-entry Adapter', () => {
  const ventureId = '00000000-0000-0000-0000-000000000001';
  const syncData = {
    commitSha: 'abc1234def5678',
    branch: 'replit/sprint-1',
    repoUrl: 'https://github.com/rickfelix/test-venture',
    commitCount: 12,
    synced: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('should write records for stages 20, 21, and 22', async () => {
    const result = await importReplitBuild(ventureId, syncData);

    expect(result.success).toBe(true);
    expect(result.stagesWritten).toEqual([20, 21, 22]);
    expect(result.errors).toHaveLength(0);
  });

  it('should include replit_sync metadata in Stage 20 record', async () => {
    await importReplitBuild(ventureId, syncData);

    // Verify upsert was called with correct Stage 20 data
    const calls = mockUpsert.mock.calls;
    const s20Call = calls.find(c => c[0]?.lifecycle_stage === 20);
    expect(s20Call).toBeTruthy();
    expect(s20Call[0].advisory_data.build_method).toBe('replit_agent');
    expect(s20Call[0].advisory_data.replit_sync.last_commit_sha).toBe('abc1234def5678');
    expect(s20Call[0].advisory_data.tasks).toHaveLength(1);
    expect(s20Call[0].advisory_data.dataSource).toBe('replit_reentry_adapter');
  });

  it('should set stages 21 and 22 as awaiting_verification', async () => {
    await importReplitBuild(ventureId, syncData);

    const calls = mockUpsert.mock.calls;
    const s21Call = calls.find(c => c[0]?.lifecycle_stage === 21);
    const s22Call = calls.find(c => c[0]?.lifecycle_stage === 22);

    expect(s21Call[0].advisory_data.awaiting_verification).toBe(true);
    expect(s21Call[0].stage_status).toBe('not_started');
    expect(s22Call[0].advisory_data.awaiting_verification).toBe(true);
  });

  it('should fail gracefully when no commit SHA provided', async () => {
    const result = await importReplitBuild(ventureId, { commitSha: null });

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('No commit SHA');
  });

  it('should report errors when upsert fails', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'DB write failed' } });

    const result = await importReplitBuild(ventureId, syncData);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should produce Stage 20 contract-compatible data shape', async () => {
    await importReplitBuild(ventureId, syncData);

    const calls = mockUpsert.mock.calls;
    const s20Data = calls.find(c => c[0]?.lifecycle_stage === 20)?.[0]?.advisory_data;

    // Stage 20 contract: tasks (array), total_tasks (number), completed_tasks (number)
    expect(Array.isArray(s20Data.tasks)).toBe(true);
    expect(typeof s20Data.total_tasks).toBe('number');
    expect(typeof s20Data.completed_tasks).toBe('number');
    expect(s20Data.total_tasks).toBeGreaterThan(0);
  });
});
