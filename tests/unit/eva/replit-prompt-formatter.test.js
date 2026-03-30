import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before importing the module
const mockRpc = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));
mockSelect.mockReturnValue({
  eq: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({
      data: { name: 'Test Venture', description: 'A test venture' },
      error: null,
    }),
  }),
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

const { formatReplitPrompt } = await import('../../../lib/eva/bridge/replit-prompt-formatter.js');

describe('Replit Prompt Formatter', () => {
  const mockVentureId = '00000000-0000-0000-0000-000000000001';

  const mockBlueprintData = {
    summary: {
      total_artifacts: 25,
      overall_quality_score: 85,
      group_count: 7,
    },
    groups: [
      {
        group: 'What to Build',
        group_name: 'What to Build',
        group_key: 'what_to_build',
        artifact_count: 4,
        artifacts: [
          { title: 'Product Vision', artifact_type: 'vision', lifecycle_stage: 1, content: 'Build an AI-powered task manager' },
          { title: 'Customer Personas', artifact_type: 'personas', lifecycle_stage: 10, content: 'Primary persona: busy professional' },
        ],
      },
      {
        group: 'How to Build It',
        group_name: 'How to Build It',
        group_key: 'how_to_build_it',
        artifact_count: 3,
        artifacts: [
          { title: 'Technical Architecture', artifact_type: 'architecture', lifecycle_stage: 14, content: 'React + TypeScript + Supabase with Next.js framework' },
        ],
      },
      {
        group: 'Sprint Plan',
        group_name: 'Sprint Plan',
        group_key: 'sprint_plan',
        artifact_count: 1,
        artifacts: [
          {
            title: 'Sprint 1', artifact_type: 'sprint_plan', lifecycle_stage: 19,
            content: {
              items: [
                { name: 'User Auth', description: 'Implement login/signup', story_points: 5 },
                { name: 'Dashboard', description: 'Build main dashboard', story_points: 8 },
              ],
            },
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: mockBlueprintData, error: null });
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { name: 'Test Venture', description: 'A test venture' },
          error: null,
        }),
      }),
    });
  });

  it('should generate a prompt with all required sections', async () => {
    const result = await formatReplitPrompt(mockVentureId);

    expect(result.prompt).toContain('# Build Brief: Test Venture');
    expect(result.prompt).toContain('## Build Instructions for Replit Agent');
    expect(result.prompt).toContain('## Planning Artifacts');
    expect(result.prompt).toContain('### What to Build');
    expect(result.prompt).toContain('### How to Build It');
    expect(result.charCount).toBeGreaterThan(0);
    expect(result.groupCount).toBe(3);
  });

  it('should extract sprint items as actionable tasks', async () => {
    const result = await formatReplitPrompt(mockVentureId);

    expect(result.prompt).toContain('## Sprint Items (Actionable Tasks)');
    expect(result.prompt).toContain('**User Auth** (5 pts)');
    expect(result.prompt).toContain('**Dashboard** (8 pts)');
  });

  it('should detect Next.js from architecture artifacts', async () => {
    const result = await formatReplitPrompt(mockVentureId);

    expect(result.prompt).toContain('**Framework**: Next.js');
  });

  it('should warn when prompt exceeds token budget', async () => {
    // Create a large mock dataset
    const largeData = { ...mockBlueprintData };
    largeData.groups[0].artifacts[0].content = 'x'.repeat(60000);
    mockRpc.mockResolvedValue({ data: largeData, error: null });

    const result = await formatReplitPrompt(mockVentureId);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('50000');
  });

  it('should truncate in compact mode', async () => {
    const largeData = { ...mockBlueprintData };
    largeData.groups[0].artifacts[0].content = 'x'.repeat(5000);
    mockRpc.mockResolvedValue({ data: largeData, error: null });

    const result = await formatReplitPrompt(mockVentureId, { compact: true });

    expect(result.warnings.some(w => w.includes('truncated'))).toBe(true);
  });

  it('should throw on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } });

    await expect(formatReplitPrompt(mockVentureId)).rejects.toThrow('export_blueprint_review failed');
  });

  it('should throw on empty artifacts', async () => {
    mockRpc.mockResolvedValue({ data: { groups: [] }, error: null });

    await expect(formatReplitPrompt(mockVentureId)).rejects.toThrow('No planning artifacts found');
  });

  it('should skip instructions when includeInstructions is false', async () => {
    const result = await formatReplitPrompt(mockVentureId, { includeInstructions: false });

    expect(result.prompt).not.toContain('## Build Instructions for Replit Agent');
  });
});
