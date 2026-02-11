/**
 * OpenAI Compatibility Layer Tests
 *
 * Validates that all provider adapters support both calling patterns:
 * 1. adapter.complete(systemPrompt, userPrompt, options)  - native interface
 * 2. adapter.chat.completions.create({ messages, ... })   - OpenAI-compatible interface
 *
 * Root cause: Half-migrated callers use getLLMClient() from factory but call
 * .chat.completions.create() (OpenAI SDK format) on the returned adapter.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the Anthropic SDK before importing adapters
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ text: '{"result": "test"}' }],
          usage: { input_tokens: 100, output_tokens: 50 }
        })
      };
    }
  }
}));

const { AnthropicAdapter, OpenAIAdapter, OllamaAdapter, GoogleAdapter } = await import(
  '../../../lib/sub-agents/vetting/provider-adapters.js'
);

describe('OpenAI Compatibility Layer', () => {
  describe('AnthropicAdapter', () => {
    it('should have .chat.completions.create() method', () => {
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      expect(adapter.chat).toBeDefined();
      expect(adapter.chat.completions).toBeDefined();
      expect(typeof adapter.chat.completions.create).toBe('function');
    });

    it('should return OpenAI-formatted response from .chat.completions.create()', async () => {
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      const response = await adapter.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a test assistant.' },
          { role: 'user', content: 'Say hello' }
        ],
        response_format: { type: 'json_object' }
      });

      expect(response.choices).toBeDefined();
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.content).toBe('{"result": "test"}');
      expect(response.choices[0].message.role).toBe('assistant');
      expect(response.choices[0].finish_reason).toBe('stop');
      expect(response.usage).toBeDefined();
      expect(response.usage.prompt_tokens).toBe(100);
      expect(response.usage.completion_tokens).toBe(50);
      expect(response.usage.total_tokens).toBe(150);
      expect(response.model).toBeDefined();
    });

    it('should extract system and user prompts from messages array', async () => {
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      await adapter.chat.completions.create({
        messages: [
          { role: 'system', content: 'system-prompt' },
          { role: 'user', content: 'user-prompt' }
        ]
      });

      // Verify the underlying Anthropic SDK was called correctly
      expect(adapter.client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'system-prompt',
          messages: [{ role: 'user', content: 'user-prompt' }]
        })
      );
    });

    it('should handle missing system message gracefully', async () => {
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      const response = await adapter.chat.completions.create({
        messages: [
          { role: 'user', content: 'just user prompt' }
        ]
      });

      expect(response.choices[0].message.content).toBe('{"result": "test"}');
    });

    it('should pass max_completion_tokens as maxTokens', async () => {
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      await adapter.chat.completions.create({
        messages: [{ role: 'user', content: 'test' }],
        max_completion_tokens: 8000
      });

      expect(adapter.client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 8000
        })
      );
    });
  });

  describe('All adapters have compat layer', () => {
    it('OpenAIAdapter should have .chat.completions.create()', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      expect(adapter.chat).toBeDefined();
      expect(typeof adapter.chat.completions.create).toBe('function');
    });

    it('GoogleAdapter should have .chat.completions.create()', () => {
      const adapter = new GoogleAdapter({ apiKey: 'test-key' });
      expect(adapter.chat).toBeDefined();
      expect(typeof adapter.chat.completions.create).toBe('function');
    });

    it('OllamaAdapter should have .chat.completions.create()', () => {
      const adapter = new OllamaAdapter();
      expect(adapter.chat).toBeDefined();
      expect(typeof adapter.chat.completions.create).toBe('function');
    });
  });

  describe('callOpenAI 2-arg pattern', () => {
    it('should handle callOpenAI(client, messages) without model arg', async () => {
      // Import the API function
      const { callOpenAI } = await import(
        '../../../scripts/modules/ai-quality-evaluator/api.js'
      );

      const adapter = new AnthropicAdapter({ apiKey: 'test-key', model: 'test-model' });

      const messages = [
        { role: 'system', content: 'You evaluate quality.' },
        { role: 'user', content: 'Rate this: test content' }
      ];

      const response = await callOpenAI(adapter, messages);

      expect(response.choices).toBeDefined();
      expect(response.choices[0].message.content).toBe('{"result": "test"}');
    });

    it('should handle callOpenAI(client, model, messages) with explicit model', async () => {
      const { callOpenAI } = await import(
        '../../../scripts/modules/ai-quality-evaluator/api.js'
      );

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

      const messages = [
        { role: 'system', content: 'test' },
        { role: 'user', content: 'test' }
      ];

      const response = await callOpenAI(adapter, 'explicit-model', messages);

      expect(response.choices).toBeDefined();
    });
  });
});
