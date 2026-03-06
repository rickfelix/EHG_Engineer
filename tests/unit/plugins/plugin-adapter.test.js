import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adaptPlugin } from '../../../lib/plugins/plugin-adapter.js';

describe('plugin-adapter', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    };
  });

  it('rejects invalid plugin record', async () => {
    const result = await adaptPlugin(mockSupabase, null);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('rejects already adapted plugin', async () => {
    const result = await adaptPlugin(mockSupabase, {
      id: '123',
      plugin_name: 'test',
      status: 'adapted',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already adapted');
  });

  it('creates agent_skills entry and updates registry on success', async () => {
    const skillId = 'skill-uuid-123';
    const upsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: skillId }, error: null }),
      }),
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'agent_skills') return { upsert: upsertMock };
      if (table === 'anthropic_plugin_registry') return { update: updateMock };
      return {};
    });

    const result = await adaptPlugin(mockSupabase, {
      id: 'plugin-123',
      plugin_name: 'test-tool',
      source_repo: 'anthropics/cookbook',
      source_path: 'tools/test',
      status: 'evaluating',
      fitness_evaluation: { adaptation_notes: 'High relevance' },
    });

    expect(result.success).toBe(true);
    expect(result.skillId).toBe(skillId);
    expect(result.skillKey).toBe('anthropic-plugin-test-tool');
  });

  it('handles agent_skills upsert failure', async () => {
    mockSupabase.from.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'constraint violation' } }),
        }),
      }),
    });

    const result = await adaptPlugin(mockSupabase, {
      id: 'plugin-123',
      plugin_name: 'test',
      source_repo: 'anthropics/test',
      source_path: 'tools/test',
      status: 'evaluating',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('agent_skills upsert');
  });

  it('generates correct skill_key from plugin name', async () => {
    const upsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'id' }, error: null }),
      }),
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'agent_skills') return { upsert: upsertMock };
      if (table === 'anthropic_plugin_registry') return { update: updateMock };
      return {};
    });

    const result = await adaptPlugin(mockSupabase, {
      id: 'p1',
      plugin_name: 'My Cool Plugin!',
      source_repo: 'anthropics/test',
      source_path: 'tools/test',
      status: 'evaluating',
    });

    expect(result.skillKey).toBe('anthropic-plugin-my-cool-plugin-');
  });
});
