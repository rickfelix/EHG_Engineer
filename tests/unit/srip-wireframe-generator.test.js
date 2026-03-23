import { describe, it, expect, vi, beforeEach } from 'vitest';

const wireframeJson = {
  screens: [
    { name: 'Landing Page', purpose: 'Convert visitors', wireframe: '┌──┐\n│  │\n└──┘', components: ['hero', 'cta'], user_flow_notes: 'Entry', brand_alignment: 'Bold' },
    { name: 'Dashboard', purpose: 'Main workspace', wireframe: '┌──┐\n│  │\n└──┘', components: ['sidebar', 'chart'], user_flow_notes: 'Post-login', brand_alignment: 'Clean' },
  ],
  flows: [{ name: 'Onboarding', steps: ['Landing -> Signup -> Dashboard'], persona: 'New User' }],
  design_system_notes: { typography: 'Inter', color_palette: '#0066FF', component_library: 'Buttons, Cards' },
};

const specialistJson = { score: 7, rationale: 'Good structure', improvements: ['Add breadcrumbs'] };

function makeMockLLMClient(responses) {
  let callIdx = 0;
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const content = typeof responses === 'function'
            ? responses(callIdx++)
            : (Array.isArray(responses) ? responses[callIdx++] || responses[responses.length - 1] : responses);
          return { choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] };
        }),
      },
    },
  };
}

function makeMockSupabase(overrides = {}) {
  const chain = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: overrides.artifact || null })),
    rpc: vi.fn(() => Promise.resolve({ data: overrides.designRefs || [] })),
  };
  return chain;
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('SRIP Wireframe Generator', () => {
  let generateWireframes;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../scripts/eva/srip/srip-wireframe-generator.js');
    generateWireframes = mod.generateWireframes;
  });

  it('exports generateWireframes function', () => {
    expect(typeof generateWireframes).toBe('function');
  });

  it('fetches design references with correct archetype via service layer', async () => {
    const mockSupabase = makeMockSupabase();
    const mockFetchRefs = vi.fn(async () => []);
    const llm = makeMockLLMClient([wireframeJson, specialistJson, specialistJson, specialistJson, specialistJson]);

    await generateWireframes({
      ventureId: 'v1', ventureName: 'Test', archetypeCategory: 'fintech',
      logger: silentLogger, _supabase: mockSupabase, _llmClient: llm,
      _writeArtifactFn: vi.fn(async () => 'art-id'),
      _fetchDesignRefsFn: mockFetchRefs,
    });

    expect(mockFetchRefs).toHaveBeenCalledWith(mockSupabase, 'fintech');
  });

  it('defaults archetype to corporate', async () => {
    const mockSupabase = makeMockSupabase();
    const mockFetchRefs = vi.fn(async () => []);
    const llm = makeMockLLMClient([wireframeJson, specialistJson, specialistJson, specialistJson, specialistJson]);

    await generateWireframes({
      ventureId: 'v1', ventureName: 'Test',
      logger: silentLogger, _supabase: mockSupabase, _llmClient: llm,
      _writeArtifactFn: vi.fn(async () => 'art-id'),
      _fetchDesignRefsFn: mockFetchRefs,
    });

    expect(mockFetchRefs).toHaveBeenCalledWith(mockSupabase, 'corporate');
  });

  it('returns success with correct structure', async () => {
    const llm = makeMockLLMClient([wireframeJson, specialistJson, specialistJson, specialistJson, specialistJson]);
    const result = await generateWireframes({
      ventureId: 'v1', ventureName: 'Test',
      logger: silentLogger, _supabase: makeMockSupabase(), _llmClient: llm,
      _writeArtifactFn: vi.fn(async () => 'art-123'),
    });

    expect(result.success).toBe(true);
    expect(result.artifactId).toBe('art-123');
    expect(result.screen_count).toBe(2);
    expect(result.flow_count).toBe(1);
    expect(result.specialist_scores).toHaveLength(4);
    expect(result.avg_score).toBe(7);
  });

  it('generates 4 specialist scores with correct agent names', async () => {
    const llm = makeMockLLMClient([wireframeJson, specialistJson, specialistJson, specialistJson, specialistJson]);
    const result = await generateWireframes({
      ventureId: 'v1', ventureName: 'Test',
      logger: silentLogger, _supabase: makeMockSupabase(), _llmClient: llm,
      _writeArtifactFn: vi.fn(async () => 'art-id'),
    });

    const agents = result.specialist_scores.map(s => s.agent);
    expect(agents).toContain('UX Architect');
    expect(agents).toContain('Interaction Designer');
    expect(agents).toContain('Accessibility Expert');
    expect(agents).toContain('Frontend Engineer');
  });

  it('handles LLM failure gracefully', async () => {
    const llm = makeMockLLMClient('not valid json');
    const result = await generateWireframes({
      ventureId: 'v1', ventureName: 'Test',
      logger: silentLogger, _supabase: makeMockSupabase(), _llmClient: llm,
      _writeArtifactFn: vi.fn(async () => 'art-id'),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Generation failed');
  });

  it('persists artifact with correct metadata', async () => {
    const writeFn = vi.fn(async () => 'art-persist');
    const llm = makeMockLLMClient([wireframeJson, specialistJson, specialistJson, specialistJson, specialistJson]);

    await generateWireframes({
      ventureId: 'v-test', ventureName: 'My Startup', archetypeCategory: 'saas',
      logger: silentLogger, _supabase: makeMockSupabase(), _llmClient: llm,
      _writeArtifactFn: writeFn,
    });

    expect(writeFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ventureId: 'v-test',
        lifecycleStage: 15,
        artifactType: 'blueprint_wireframes',
        title: 'UI Wireframes - My Startup',
        isCurrent: true,
        source: 'srip-wireframe-generator',
        metadata: expect.objectContaining({
          screen_count: 2,
          flow_count: 1,
          design_system_applied: true,
          archetype_category: 'saas',
        }),
      })
    );
  });

  it('calls LLM at least once for generation', async () => {
    const llm = makeMockLLMClient([wireframeJson, specialistJson, specialistJson, specialistJson, specialistJson]);
    await generateWireframes({
      ventureId: 'v1', ventureName: 'Test',
      logger: silentLogger, _supabase: makeMockSupabase(), _llmClient: llm,
      _writeArtifactFn: vi.fn(async () => 'art-id'),
    });

    // 1 generation + 4 specialist scores = 5 calls minimum
    expect(llm.chat.completions.create).toHaveBeenCalledTimes(5);
  });
});
