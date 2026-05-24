import { describe, test, expect, beforeEach, vi } from 'vitest';

// ── Mock: artifact-persistence-service ──────────────────────────────────────
vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn().mockResolvedValue('artifact-id-mock'),
}));

// ── Mock: LLM client-factory (getLLMClient is dynamically imported in refinement.js) ──
const mockComplete = vi.fn().mockResolvedValue({
  content: '<!-- DESIGN INTENT: test --><html><body style="color:#FF5733;font-family:Inter"><h1>Refined</h1></body></html>',
});

vi.mock('../../../lib/llm/client-factory.js', () => ({
  getLLMClient: vi.fn().mockReturnValue({
    complete: mockComplete,
  }),
  // Legacy export kept for backward-compat imports elsewhere
  createLLMClient: vi.fn().mockResolvedValue({
    messages: { create: vi.fn() },
  }),
}));

import { generateRefinedVariants } from '../../../lib/eva/stage-17/refinement.js';

describe('refinement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue({
      content: '<!-- DESIGN INTENT: test --><html><body style="color:#FF5733;font-family:Inter"><h1>Refined</h1></body></html>',
    });
  });

  describe('generateRefinedVariants()', () => {
    test('generates 4 refined variants', async () => {
      const ids = await generateRefinedVariants(
        'v-1', 'Home',
        ['<html>A1</html>', '<html>A2</html>'],
        { colors: ['#FF5733'], typeScale: { heading: 'Inter', body: 'Roboto' } },
        {}
      );
      expect(ids).toHaveLength(4);
      expect(mockComplete).toHaveBeenCalledTimes(4);
    });

    test('injects mobile context for desktop', async () => {
      await generateRefinedVariants(
        'v-1', 'Home',
        ['<html>A1</html>', '<html>A2</html>'],
        { colors: ['#FF5733'], typeScale: { heading: 'Inter', body: 'Roboto' } },
        {},
        { mobileContextHtml: '<html>Mobile</html>' }
      );

      // The prompt is the second arg to complete()
      const prompt = mockComplete.mock.calls[0][1];
      const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
      expect(promptText).toContain('MOBILE REFERENCE');
    });
  });
});
