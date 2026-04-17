import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  generateArchetypes,
  generateRefinedVariants,
  ArchetypeGenerationError,
} from '../../../lib/eva/stage-17/archetype-generator.js';

vi.mock('../../../lib/eva/stage-17/token-manifest.js', () => ({
  getTokenConstraints: vi.fn().mockResolvedValue({
    colors: ['#FF5733', '#3366CC', '#22AA44'],
    typeScale: { heading: 'Inter', body: 'Roboto' },
    spacing: { base: 4 },
  }),
}));

vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn().mockResolvedValue('artifact-id-mock'),
}));

const mockMessagesCreate = vi.fn().mockResolvedValue({
  content: [{ text: '<html><body style="color:#FF5733;font-family:Inter"><h1>Archetype</h1></body></html>' }],
});

vi.mock('../../../lib/llm/client-factory.js', () => ({
  createLLMClient: vi.fn().mockResolvedValue({
    messages: { create: mockMessagesCreate },
  }),
}));

import { writeArtifact } from '../../../lib/eva/artifact-persistence-service.js';

function createMockSupabase(artifacts = []) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: artifacts, error: null }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe('archetype-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessagesCreate.mockResolvedValue({
      content: [{ text: '<html><body style="color:#FF5733;font-family:Inter"><h1>Archetype</h1></body></html>' }],
    });
  });

  describe('generateArchetypes()', () => {
    test('returns 6 artifact IDs per screen', async () => {
      const artifacts = [
        { id: 'screen-1', content: '<div>Screen 1</div>', title: 'Home', metadata: { screenName: 'Home' } },
      ];
      const result = await generateArchetypes('venture-123', createMockSupabase(artifacts));

      expect(result.screenCount).toBe(1);
      expect(result.artifactIds).toHaveLength(6);
      expect(mockMessagesCreate).toHaveBeenCalledTimes(6);
    });

    test('applies brand tokens in prompt', async () => {
      const artifacts = [{ id: 's1', content: '<div>S</div>', title: 'Home', metadata: {} }];
      await generateArchetypes('v-1', createMockSupabase(artifacts));

      const prompt = mockMessagesCreate.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('#FF5733');
      expect(prompt).toContain('Inter');
      expect(prompt).toContain('Roboto');
    });

    test('throws ArchetypeGenerationError when no stitch artifacts', async () => {
      await expect(generateArchetypes('v-empty', createMockSupabase([]))).rejects.toThrow(ArchetypeGenerationError);
    });

    test('propagates LLM client errors', async () => {
      mockMessagesCreate.mockRejectedValueOnce(new Error('Claude API unavailable'));
      const artifacts = [{ id: 's1', content: '<div>S</div>', title: 'Home', metadata: {} }];

      await expect(generateArchetypes('v-1', createMockSupabase(artifacts))).rejects.toThrow('Claude API unavailable');
    });

    test('writes self-contained HTML (no external scripts/links)', async () => {
      const html = '<html><style>body{color:#FF5733}</style><body><h1>Test</h1></body></html>';
      mockMessagesCreate.mockResolvedValue({ content: [{ text: html }] });
      const artifacts = [{ id: 's1', content: '<div>S</div>', title: 'Home', metadata: {} }];

      await generateArchetypes('v-1', createMockSupabase(artifacts));

      const written = writeArtifact.mock.calls[0][1].content;
      expect(written).not.toContain('<script src=');
      expect(written).not.toContain('<link rel="stylesheet"');
    });

    test('processes multiple screens (12 artifacts for 2 screens)', async () => {
      const artifacts = [
        { id: 's1', content: '<div>S1</div>', title: 'Home', metadata: {} },
        { id: 's2', content: '<div>S2</div>', title: 'About', metadata: {} },
      ];
      const result = await generateArchetypes('v-1', createMockSupabase(artifacts));

      expect(result.screenCount).toBe(2);
      expect(result.artifactIds).toHaveLength(12);
    });
  });

  describe('generateRefinedVariants()', () => {
    test('generates 4 refined variants', async () => {
      const ids = await generateRefinedVariants('v-1', 'Home', ['<html>A1</html>', '<html>A2</html>'],
        { colors: ['#FF5733'], typeScale: { heading: 'Inter', body: 'Roboto' } }, {});
      expect(ids).toHaveLength(4);
      expect(mockMessagesCreate).toHaveBeenCalledTimes(4);
    });

    test('injects mobile context for desktop', async () => {
      await generateRefinedVariants('v-1', 'Home', ['<html>A1</html>', '<html>A2</html>'],
        { colors: ['#FF5733'], typeScale: { heading: 'Inter', body: 'Roboto' } }, {},
        { mobileContextHtml: '<html>Mobile</html>' });

      const prompt = mockMessagesCreate.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('MOBILE REFERENCE');
    });
  });
});
