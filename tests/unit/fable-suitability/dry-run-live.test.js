/**
 * QF-20260720-171: --live Sonnet-floor client wiring for fable-suitability dry-run.mjs.
 * Constrained tool-use decoding (never a free-text parse + repair) — mocks the Anthropic SDK
 * so no network call or real API key is required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockCreate;
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: (...args) => mockCreate(...args) };
    }
  },
}));

const { createSonnetFloorClient } = await import('../../../scripts/fable-suitability/dry-run.mjs');

describe('createSonnetFloorClient (QF-20260720-171)', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  afterEach(() => { process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY; });

  it('throws a clear, actionable error when ANTHROPIC_API_KEY is unset', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createSonnetFloorClient()).toThrow(/ANTHROPIC_API_KEY/);
  });

  describe('with ANTHROPIC_API_KEY set', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: 'tool_use', name: 'submit_score', input: { score: 4, rationale: 'entangled' } }],
      });
    });

    it('calls messages.create with forced tool_choice (constrained decoding, not free-text)', async () => {
      const client = createSonnetFloorClient();
      const schema = { type: 'object', properties: { score: { type: 'integer' } } };
      const result = await client.scoreStructured({ prompt: 'rate this', schema });

      expect(result).toEqual({ score: 4, rationale: 'entangled' });
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'submit_score' });
      expect(callArgs.tools[0].input_schema).toBe(schema);
      expect(callArgs.messages[0].content).toBe('rate this');
    });

    it('throws when the response has no tool_use block', async () => {
      mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'not structured' }] });
      const client = createSonnetFloorClient();
      await expect(client.scoreStructured({ prompt: 'x', schema: {} }))
        .rejects.toThrow(/no tool_use block/);
    });
  });
});
